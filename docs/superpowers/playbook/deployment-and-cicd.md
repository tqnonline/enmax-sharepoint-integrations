# Deployment and CI/CD

This file covers the full deployment approach: a reusable PowerShell module + Python CLI over a shared auth/REST core, async solution import, Windows CI gotchas, credential resolution, and the correct ordering for each deploy step. Cross-reference [docs/deploy/](../deploy/README.md) for cmdlet reference and examples. As a skill, this would be loaded when an agent needs to run, diagnose, or extend the deploy pipeline.

For tooling prerequisites see [README.md](./README.md). For naming conventions see [naming-conventions.md](./naming-conventions.md).

---

## Architecture

The deploy tooling is split across two layers:

| Layer | Technology | Responsibility |
|-------|-----------|---------------|
| `scripts/PowerPlatform.Deploy/` | PowerShell module | pac CLI auth, plugin registration, Code App publish, full-chain orchestration |
| `solution/scripts/powerplatform_deploy/` | Python package (`pp-deploy` CLI) | Dataverse REST: pack, import, export, schema, seed, roles, option sets |

Both layers read credentials from the same sources (see below). Project identity (prefix, solution name, BU, table list) lives in `deploy.profile.yaml` at the repo root.

**To reuse this tooling for a new project:** copy `scripts/PowerPlatform.Deploy/` and `solution/scripts/powerplatform_deploy/`, update `deploy.profile.yaml`.

---

## Credential Resolution

The tooling supports two credential sources with a clear precedence:

**CI/CD (fast path):** `DATAVERSE_URL`, `DATAVERSE_CLIENT_ID`, `DATAVERSE_CLIENT_SECRET`, `DATAVERSE_TENANT_ID` are set as environment variables (GitHub Actions secrets). When all four are present, the tooling uses them directly and skips `.env` file parsing.

**Local development:** `.env.<env>` file in `apps/code-app/` (gitignored). The file uses either the `DATAVERSE_*` names or legacy aliases (`ENVIRONMENT_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID`) — the tooling normalizes both.

```
Priority: DATAVERSE_* env vars → .env.<env> file
```

When writing new tooling or scripts, always check env vars first, then fall back to the `.env` file. Never reverse this order.

---

## pac auth create (Before Any pac Command)

```powershell
pac auth create \
  --name <env> \
  --url <ENVIRONMENT_URL> \
  --applicationId <CLIENT_ID> \
  --clientSecret <CLIENT_SECRET> \
  --tenant <TENANT_ID>
pac auth who   # confirm active env
```

Run `pac auth who` before every state-changing pac operation. Auth profiles persist across sessions but can become stale when environment URLs change. The idempotent `Connect-PpDataverse` cmdlet checks whether the URL is already in `pac auth list` before creating a new profile.

---

## The Full Deploy Chain (8 Steps)

Run in this order. Each step has dependencies on earlier steps.

```
1. pac auth           — Connect-PpDataverse
2. pack               — pp-deploy pack
3. import             — pp-deploy import
4. register plugins   — Register-PpPlugins
5. patch option sets  — pp-deploy optionsets
6. seed               — pp-deploy seed
7. provision roles    — pp-deploy roles
8. publish Code App   — Publish-PpCodeApp
```

**Why this order:**
- Solution import (step 3) must precede plugin registration (step 4) — the Custom API records and message filters are part of the solution.
- Option set patching (step 5) must follow import — the option sets must exist before patches can be applied.
- Seed (step 6) must follow option set patching — seed data references option set values by their integer codes; stale labels can cause seed lookup failures.
- Roles (step 7) must follow import and seed — privileges reference tables that must exist; seed data may create BU/team records that roles reference.
- Code App (step 8) last — the app depends on all schema, data, and config being present.

### Run the full chain

```powershell
Import-Module scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1
Invoke-PpDeploy -Environment dev
```

### Dry run

```powershell
Invoke-PpDeploy -Environment dev -WhatIf
```

PowerShell sub-cmdlets print `ShouldProcess` messages; Python CLI steps receive `--dry-run` and log intended operations without writing to Dataverse.

---

## Async Solution Import

```powershell
pac solution import \
  --path ./out/Solution.zip \
  --settings-file ./settings/dev.settings.json \
  --publish-changes \
  --activate-plugins \
  --async \
  --max-async-wait-time 60
```

**`--async` is required for non-trivial solutions.** Synchronous imports time out at the HTTP transport layer after ~30 minutes even if the import succeeds in the background. The async flag submits the import job and polls until completion (up to `--max-async-wait-time` minutes, default 60).

**`--activate-plugins` must be explicit.** Its default is false. Omitting it leaves flows and plugins in a disabled state after import.

---

## Windows CI: PYTHONUTF8=1

On Windows CI runners (and developer machines), the Python console defaults to `cp1252` (Windows-1252) encoding. The Rich/Typer libraries used by `pp-deploy` emit styled output including Unicode characters (arrows, box-drawing, check marks). When stdout is `cp1252`, the first non-ASCII character crashes the process with a `UnicodeEncodeError`.

**Fix:** set `PYTHONUTF8=1` at the job level in every GitHub Actions workflow that runs Python steps.

```yaml
jobs:
  deploy:
    runs-on: windows-latest
    env:
      PYTHONUTF8: '1'
    steps:
      - name: Pack solution
        run: python -m powerplatform_deploy.cli pack --environment dev
```

Additionally, the scripts reconfigure stdout/stderr to UTF-8 programmatically at startup:

```python
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")
```

Both guards are needed: `PYTHONUTF8=1` handles the environment; the `reconfigure` handles cases where the variable is not set (e.g. local developer running from an IDE terminal).

---

## Module/Script PSScriptRoot Resolution Gotcha

Inside a PowerShell **module function**, `$PSScriptRoot` is the directory containing the file that **defines the function** — not the file that calls it.

```
scripts/
  PowerPlatform.Deploy/
    Public/
      Register-PpPlugins.ps1   ← $PSScriptRoot = "scripts/PowerPlatform.Deploy/Public"
```

To navigate from `$PSScriptRoot` inside a function to the repo root, count the number of `Split-Path` hops:

```powershell
$moduleRoot = Split-Path $PSScriptRoot -Parent        # → scripts/PowerPlatform.Deploy/
$repoRoot   = Split-Path (Split-Path $moduleRoot -Parent) -Parent  # → repo root
```

This is a subtle, real gotcha. If the function is moved to a deeper subdirectory, the hop count must be updated. Alternatively, compute the repo root relative to a known anchor file (e.g. the presence of `.worktrees/` or `deploy.profile.yaml`).

> **Worked example (this repo):** `push-to-dev.ps1` uses `$PSScriptRoot` to find the repo root. When run from a worktree checkout, `$PSScriptRoot` points to the worktree's scripts directory, not the main repo. Fix: pass `-RepoRoot (git rev-parse --show-toplevel)` explicitly, or detect via the worktree's own anchor.

---

## Fail Loud

Every script and cmdlet must surface the Dataverse error body on failure. `raise_for_status()` alone hides the actual error message. Pattern:

```python
resp = session.post(url, json=body, headers=headers)
if not resp.ok:
    raise RuntimeError(f"POST {url} -> {resp.status_code}: {resp.text}")
```

```powershell
if (-not $response.ok) {
    throw "API call failed: $($response.StatusCode) - $($response.Content)"
}
```

Do not swallow errors with `try/except: pass` or `ErrorAction SilentlyContinue` on state-changing operations. Partial deploys that appear to succeed are harder to diagnose than explicit failures.

---

## Granular CD Steps for Log Visibility

In GitHub Actions, run each deploy step as a named step (not a single multi-command script block). This gives per-step timing and per-step failure attribution in the Actions log.

```yaml
env:
  PYTHONUTF8: '1'

steps:
  - name: Authenticate pac CLI
    shell: pwsh
    env:
      DATAVERSE_URL: ${{ secrets.DEV_DATAVERSE_URL }}
      DATAVERSE_CLIENT_ID: ${{ secrets.DEV_SP_CLIENT_ID }}
      DATAVERSE_CLIENT_SECRET: ${{ secrets.DEV_SP_CLIENT_SECRET }}
      DATAVERSE_TENANT_ID: ${{ secrets.DEV_TENANT_ID }}
    run: |
      Import-Module ./scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1 -Force
      Connect-PpDataverse -Environment dev

  - name: Pack solution
    env:
      DATAVERSE_URL: ${{ secrets.DEV_DATAVERSE_URL }}
      # ... other secrets
    run: python -m powerplatform_deploy.cli pack --environment dev

  - name: Import solution
    env: { ... }
    run: python -m powerplatform_deploy.cli import --environment dev

  - name: Register plugins and Custom APIs
    shell: pwsh
    env: { ... }
    run: |
      Import-Module ./scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1 -Force
      Register-PpPlugins -Environment dev

  - name: Patch option sets
    env: { ... }
    run: python -m powerplatform_deploy.cli optionsets --environment dev

  - name: Seed master data
    env: { ... }
    run: python -m powerplatform_deploy.cli seed --environment dev

  - name: Provision security roles
    env: { ... }
    run: python -m powerplatform_deploy.cli roles --environment dev

  - name: Publish Code App
    shell: pwsh
    env: { ... }
    run: |
      Import-Module ./scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1 -Force
      Publish-PpCodeApp -Environment dev
```

---

## Idempotent, Deterministic, Re-runnable Deploys

Every deploy operation must be safe to run multiple times against the same environment. This requires:

- **Check-before-create** for all metadata (tables, columns, roles, Custom APIs, plugin steps).
- **PATCH-upsert** for data (seed records identified by deterministic GUID).
- **ReplacePrivilegesRole** for roles (replaces the full privilege set, not additive).
- **Assembly PATCH** for plugin DLL (updates content, does not recreate the record).

A deploy that fails halfway should be re-runnable from the top without leaving orphaned or duplicated records.

---

## deploy.profile.yaml

Project identity for the Python deploy package. One file per project, committed to the repo root:

```yaml
entity_prefix: pub          # customization prefix (without trailing _)
solution_name: MySolution   # Dataverse solution unique name
business_unit: my-app-bu    # BU name for role provisioning
security_roles_file: solution/seed/security_roles.yaml
tables:
  - pub_mytable
  - pub_anothertable
  - pub_appconfig
```

The Python CLI reads this file to know which tables to include, what prefix to use for generated names, and which BU to target.

---

## Smoke Test After Deploy

The Code App uses `getContext()` which requires a real Power Apps iframe. After pushing:

```powershell
Publish-PpCodeApp -Environment dev
# Copy the printed play URL and open in a browser logged into the tenant
```

Open the live app URL in a browser session authenticated to the Power Platform tenant. Verify:
- App loads without blank/spinner state
- Role resolution works (correct role shown or implied by available actions)
- Key features work end-to-end (create a record, trigger a Custom API, observe state change)

Playwright smoke tests run automatically in the CD pipeline using `--grep @smoke` against `SMOKE_URL`. See [code-apps.md](./code-apps.md) for the Playwright configuration.

---

## Local Developer Deploy (Worktree Pattern)

When working in a git worktree, the `.env.dev` file may not exist in the worktree — it is gitignored and lives only in the main checkout. Copy it before deploying:

```powershell
# Copy .env from main repo to worktree
Copy-Item "D:\path\to\main-repo\apps\code-app\.env.dev" `
  "D:\path\to\main-repo\.worktrees\feat-NNN\apps\code-app\.env.dev"

# Deploy from the worktree root — pass -RepoRoot explicitly
.\scripts\PowerPlatform.Deploy\Public\Publish-PpCodeApp.ps1 `
  -Environment dev
# Or use the module:
Import-Module .\scripts\PowerPlatform.Deploy\PowerPlatform.Deploy.psd1
Publish-PpCodeApp -Environment dev
```

When the deploy script uses `$PSScriptRoot` to find the repo root, running it from inside a worktree may resolve to the worktree root (which is correct if the module is loaded from the worktree). Verify by printing `git rev-parse --show-toplevel` from the worktree before running the deploy.

---

## Install and Use the Deploy Tooling

This section covers how to install the PowerShell module and Python package locally, verify the installation, and run commands. For the full 8-step deploy chain see the "Full Deploy Chain" section above.

### PowerShell Module

The module lives at `scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1`. It is loaded per-session; it is not published to the PowerShell Gallery.

**Load the module:**

```powershell
# Option A: import by path (recommended for scripts)
Import-Module ./scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1 -Force

# Option B: add to PSModulePath and import by name (useful for interactive sessions)
$env:PSModulePath += ";$PWD/scripts"
Import-Module PowerPlatform.Deploy -Force
```

**Verify the install:**

```powershell
Get-Command -Module PowerPlatform.Deploy
# Expected output includes:
#   Connect-PpDataverse
#   Register-PpPlugins
#   Publish-PpCodeApp
#   Invoke-PpDeploy
```

**Key cmdlets:**

| Cmdlet | Purpose |
|--------|---------|
| `Connect-PpDataverse -Environment dev` | Idempotent pac auth create/select for the named env |
| `Register-PpPlugins -Environment dev` | Build plugin DLL + register assembly, Custom APIs, steps, images |
| `Publish-PpCodeApp -Environment dev` | Build Code App + push to Power Apps via npm CLI |
| `Invoke-PpDeploy -Environment dev` | Full 8-step deploy chain in one command |
| `Invoke-PpDeploy -Environment dev -WhatIf` | Dry run: prints intended operations, no writes |

**Run the module's tests (Pester v5):**

```powershell
Invoke-Pester -Path scripts/PowerPlatform.Deploy/Tests -Output Detailed
```

> **Worked example (this repo):** Module is at `scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1`. Exported cmdlets include `Connect-PpDataverse`, `Register-PpPlugins`, `Publish-PpCodeApp`, and `Invoke-PpDeploy`. The `Data/PluginDefinitions.psd1` data file drives Custom API registration idempotently.

---

### Python Package (`pp-deploy`)

The Python package lives at `solution/scripts/powerplatform_deploy/`. It is a standard `pyproject.toml` package with a `pp-deploy` entry point.

**Install with uv (preferred):**

```powershell
uv pip install -e solution/scripts
```

Always use `uv` rather than bare `pip` for package operations. See memory reference [Use uv over pip].

**Verify the install:**

```powershell
pp-deploy --help
# OR (robust fallback — see below):
python -m powerplatform_deploy.cli --help
```

**Entry point PATH caveat:** after `uv pip install -e`, the `pp-deploy` script lands in the interpreter's `Scripts/` directory (Windows) or `bin/` directory (Unix). On Windows, this directory may not be on `$PATH` in all terminal sessions.

Robust fallback — always works:

```powershell
python -m powerplatform_deploy.cli <command> --environment <env>
```

**Windows encoding gotcha:** on Windows the Python console defaults to `cp1252`. The CLI uses Unicode characters in styled output. Set `PYTHONUTF8=1` before running any Python deploy command:

```powershell
$env:PYTHONUTF8 = '1'
python -m powerplatform_deploy.cli pack --environment dev
```

In CI, set this at the job level (see the GitHub Actions example in "Granular CD Steps" above).

**Microsoft Store Python stub warning:** on some Windows machines, `python` resolves to a Microsoft Store stub (`%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe`) that opens the Store instead of running Python. Verify:

```powershell
(Get-Command python).Source
# If it resolves to WindowsApps\python.exe, install real Python and prepend it to PATH
```

**Key CLI subcommands:**

| Command | Purpose |
|---------|---------|
| `pp-deploy pack --environment dev` | Pack the solution zip from `solution/src/` |
| `pp-deploy import --environment dev` | Import the solution zip to the target Dataverse env |
| `pp-deploy import --environment uat --stage-and-upgrade` | Managed upgrade import |
| `pp-deploy optionsets --environment dev` | Patch option set labels after import |
| `pp-deploy seed --environment dev` | Push deterministic seed data |
| `pp-deploy roles --environment dev` | Provision security roles idempotently |
| `pp-deploy roles --environment dev --dry-run` | Preview role changes without writing |
| `pp-deploy schema --environment dev` | Provision tables, columns, relationships, keys |

**Run the package's tests (pytest):**

```powershell
$env:PYTHONUTF8 = '1'
Set-Location solution/scripts
python -m pytest
```

---

### Thin Shim Scripts

Three thin shim scripts in `scripts/` wrap the PowerShell module cmdlets for convenience. They are the recommended entry point for local developer use.

| Script | Calls | Purpose |
|--------|-------|---------|
| `scripts/deploy-local.ps1` | `Invoke-PpDeploy` | Full deploy to a named environment |
| `scripts/push-to-dev.ps1` | `Publish-PpCodeApp` | Push only the Code App to dev |
| `scripts/deploy-plugins.ps1` | `Register-PpPlugins` | Register/update plugins and Custom APIs |

Usage:

```powershell
# Full deploy
.\scripts\deploy-local.ps1 -Environment dev

# Code App only (fast; skips solution import and plugin registration)
.\scripts\push-to-dev.ps1 -Environment dev

# Plugins/Custom APIs only (after a C# change)
.\scripts\deploy-plugins.ps1 -Environment dev
```

For full cmdlet reference and examples, see `docs/deploy/` in the main repo.

Cross-reference [repo-setup.md](./repo-setup.md) for the full directory layout showing where these scripts live.
