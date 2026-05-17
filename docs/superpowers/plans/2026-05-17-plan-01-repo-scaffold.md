# Plan #01 — Repository Scaffold

**Date:** 2026-05-17
**Owner:** Engineering (Claude Code agent + human reviewer)
**Spec:** `2026-05-17-phase-1-cut-line-spec.md`
**PRD refs:** sections 15, 18, 19, 20, 22
**Decisions:** `2026-05-17-open-questions-decision-memo.md`
**Estimated effort:** 4–6 hours (one focused session)
**Branch:** `feat/001-repo-scaffold` → PR to `dev`

## Context

The repo currently contains only `CLAUDE.md` and the orphan `specs` worktree. Before any feature work can start, the workspace, build tooling, CI scaffolding, branching model, and supporting metadata files (CLAUDE.md rules 14/15, CONTRIBUTING, LICENSE, PR template, issue templates) must be in place. This plan delivers the empty-but-correct skeleton that every subsequent plan (#02 seed data, #03 plug-in, #04 Code App shell, …) builds on top of.

This plan does **not** produce any feature code, any real flows, any Dataverse tables, or any runnable app. It produces an empty, valid scaffold that `npm install` and `pip install -r requirements.txt` succeed against, and that CI green-lights on a no-op PR.

## Prerequisites

- Repo `tqnonline/enmax-autocad` exists locally at `D:\Developer\Github\enmax-autocad`. ✅ verified
- `main` branch exists and is the working branch. ✅ verified
- `specs` orphan branch exists, accessible via `.worktrees/specs`. ✅ verified
- Decision memo Q1, Q4, Q7 closed (separate prefixes, Canada Central, code-apps toggle ON). ✅ closed 2026-05-17
- Local tooling installed:
  - Node 20.x LTS (required by `@microsoft/power-apps` SDK)
  - npm 10.x (Code App workspace + power-apps CLI)
  - Python 3.11+ (seed scripts)
  - .NET SDK 10.x (build host only — used to invoke `dotnet build` and `dotnet tool install`). SDK 10.x is forward-compatible: it builds net462-targeted projects via the reference-assemblies NuGet package below.
  - .NET Framework 4.6.2 targeting pack — **the plug-in itself targets .NET Framework 4.6.2, not .NET 8**. This is a hard Dataverse platform constraint ([MS Learn: Write a plug-in](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/write-plug-in)). On Windows, install via Visual Studio installer or [the .NET Framework 4.6.2 Developer Pack](https://dotnet.microsoft.com/download/dotnet-framework/net462). On Linux/macOS CI, the `Microsoft.NETFramework.ReferenceAssemblies` NuGet package provides the reference assemblies; no Mono needed.
  - PAC CLI (Power Platform CLI) — `dotnet tool install --global Microsoft.PowerApps.CLI.Tool`. Used both for solution pack/unpack and for scaffolding the plug-in project (`pac plugin init`).
  - GitHub CLI (`gh`) authenticated against `tqnonline` org

## Out of Scope for This Plan

- Any Dataverse table definitions or imports (→ plan #02)
- Any C# plug-in logic (→ plan #03)
- Any React component code beyond Vite default scaffold (→ plan #04)
- Real seed data (→ plan #02; this plan creates the empty `solution/seed/` directory only)
- Runbook content (`runbooks/` orphan branch creation only; runbook authoring is a separate track)
- Branch protection rules in GitHub UI (documented as a manual step; not enforced from CLI in this plan)

## Step 1 — Workspace root

**Files created:**
- `package.json` (root, npm workspaces)
- `.gitignore`
- `.editorconfig`
- `.nvmrc` (pin Node version)
- `README.md`
- `LICENSE` (proprietary, ENMAX copyright)
- `CONTRIBUTING.md`

**`package.json` (root):**

```json
{
  "name": "enmax-autocad",
  "private": true,
  "version": "0.0.0",
  "workspaces": [
    "apps/code-app"
  ],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  },
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  }
}
```

**`.gitignore` essentials:**

```
# Worktrees (per CLAUDE.md project pattern)
.worktrees/

# Node
node_modules/
dist/
.vite/
coverage/
*.tsbuildinfo

# Python
__pycache__/
*.pyc
.venv/
venv/
*.egg-info/

# .NET / plugin
solution/plugins/**/bin/
solution/plugins/**/obj/

# PAC / Power Platform
solution/src/**/*.zip
power.config.json
.pac/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Secrets
.env
.env.local
*.pem
*.pfx
```

**`.nvmrc`:** `20`

**`.editorconfig`:**

```
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.{py,cs}]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

**`LICENSE`:** Proprietary one-paragraph copyright in ENMAX's name, all-rights-reserved (per PRD section 20). Final wording confirmed by ENMAX legal at runbook execution time; placeholder text included here, marked TODO for legal review.

**Verification:**
- `node --version` matches `.nvmrc`
- `npm install` succeeds at repo root (no workspaces yet, no-op but valid)
- `git status` shows only intended files

## Step 2 — Directory tree

Create the full skeleton per PRD section 20 verbatim:

```
/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug.yml
│   │   ├── feature.yml
│   │   └── manual-handoff.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── ci.yml
│       ├── cd-dev.yml
│       └── cd-uat.yml
├── apps/
│   ├── code-app/         # Scaffold target for Step 3
│   └── admin-app/
│       └── README.md     # Placeholder; PAC manages contents
├── solution/
│   ├── src/              # PAC unpack target; empty .gitkeep
│   ├── plugins/
│   │   └── IssueNumbers/ # Scaffold target for Step 4
│   ├── seed/             # YAML seed files; empty .gitkeep (plan #02 fills this)
│   └── scripts/
│       ├── pack.py
│       ├── import.py
│       ├── seed.py
│       ├── export.py
│       ├── extract_master_data.py
│       └── requirements.txt
├── docs/
│   └── README.md         # Pointer to .worktrees/specs/docs/superpowers/
├── CLAUDE.md             # Already exists; appended in Step 7
├── CONTRIBUTING.md       # Created in Step 1
├── LICENSE               # Created in Step 1
├── README.md             # Created in Step 1
└── package.json          # Created in Step 1
```

**Verification:**
- All directories present, every empty leaf has a `.gitkeep` so git tracks the structure
- `find . -type d -empty -not -path './.worktrees/*' -not -path './.git/*'` returns nothing

## Step 3 — Code App scaffold (`apps/code-app/`)

**Commands (run from repo root):**

```bash
# Scaffold from Microsoft template
npx degit github:microsoft/PowerAppsCodeApps/templates/vite apps/code-app

# Install dependencies
cd apps/code-app
npm install

# Add Power Apps SDK
npm install @microsoft/power-apps

# Add Fluent UI v9 + state libraries (per PRD section 15.2)
npm install @fluentui/react-components @fluentui/react-icons
npm install @tanstack/react-query zustand react-router-dom
npm install react-hook-form zod @hookform/resolvers

# Add dev tooling
npm install -D vitest @vitest/coverage-v8 @vitest/ui
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install -D @playwright/test @axe-core/playwright msw
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install -D prettier eslint-config-prettier eslint-plugin-react eslint-plugin-react-hooks
```

**`power-apps init` is deferred to plan #04** — it requires the dev environment ID, which is gathered as part of runbook #003 (Power Platform environment setup). This plan creates the workspace; plan #04 binds it to a real tenant.

**Files committed:**
- `apps/code-app/package.json`
- `apps/code-app/tsconfig.json`
- `apps/code-app/vite.config.ts`
- `apps/code-app/src/` (Vite default — `App.tsx`, `main.tsx`, etc.; replaced wholesale in plan #04)
- `apps/code-app/.eslintrc.cjs`
- `apps/code-app/.prettierrc`
- `apps/code-app/playwright.config.ts` (skeleton, no real tests)
- `apps/code-app/vitest.config.ts`

**Files generated, gitignored, not committed:**
- `apps/code-app/node_modules/`
- `apps/code-app/dist/`
- `apps/code-app/power.config.json` (only after plan #04 runs `power-apps init`)

**Verification:**
- `cd apps/code-app && npm run build` produces a `dist/` output
- `npm run lint` returns zero errors on default scaffold
- `npm test` runs Vitest and reports "no tests found" (expected)
- `npx playwright test --list` reports zero tests (expected)

## Step 4 — Solution + plug-in scaffold (`solution/`)

**`solution/plugins/IssueNumbers/`** — Dataverse plug-in project targeting **.NET Framework 4.6.2** (Dataverse platform constraint; see [MS Learn: Write a plug-in](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/write-plug-in)).

Use `pac plugin init` to generate a correctly-configured project with `PluginBase.cs` already wired up — do not use `dotnet new classlib`, which defaults to a modern target framework that won't load into Dataverse.

```bash
cd solution/plugins
mkdir IssueNumbers && cd IssueNumbers
pac plugin init --outputDirectory .
# pac plugin init generates:
#   - IssueNumbers.csproj (SDK-style, TargetFramework=net462)
#   - PluginBase.cs       (abstract base implementing IPlugin)
#   - Plugin1.cs          (sample derived class, renamed in plan #03)
#   - Builds against Microsoft.CrmSdk.CoreAssemblies via NuGet

# Add reference assemblies so dotnet build works on Linux CI without Mono
dotnet add package Microsoft.NETFramework.ReferenceAssemblies --version 1.0.3

# Verify build
dotnet build
```

**Expected `IssueNumbers.csproj` (post `pac plugin init`):**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net462</TargetFramework>
    <SignAssembly>true</SignAssembly>
    <AssemblyOriginatorKeyFile>IssueNumbers.snk</AssemblyOriginatorKeyFile>
    <RootNamespace>Enmax.AutoCad.Plugins.IssueNumbers</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.CrmSdk.CoreAssemblies" Version="9.0.2.51" />
    <PackageReference Include="Microsoft.NETFramework.ReferenceAssemblies" Version="1.0.3">
      <PrivateAssets>all</PrivateAssets>
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
    </PackageReference>
  </ItemGroup>
</Project>
```

**Why `net462` (not net6.0, net8.0, or netstandard):**
- Dataverse sandbox loads plug-in assemblies into a .NET Framework 4.6.2 runtime.
- Newer target frameworks produce assemblies that fail registration with an obscure load error.
- This is documented and non-negotiable per MS Learn.

**Why strong-name signing (`SignAssembly`):**
- Dataverse plug-in registration requires the assembly to be strong-named.
- `pac plugin init` generates the `.snk` file; commit it (it's a build artifact, not a secret).

**Files committed:**
- `solution/plugins/IssueNumbers/IssueNumbers.csproj`
- `solution/plugins/IssueNumbers/PluginBase.cs` (generated, do not modify)
- `solution/plugins/IssueNumbers/Plugin1.cs` (generated stub; renamed and implemented in plan #03)
- `solution/plugins/IssueNumbers/IssueNumbers.snk` (strong-name key; required for registration)

**Files gitignored:** `bin/`, `obj/`.

**`solution/scripts/requirements.txt`:**

```
requests>=2.31
PyYAML>=6.0
azure-identity>=1.15
msal>=1.27
python-dotenv>=1.0
```

**`solution/scripts/seed.py`** — skeleton only:

```python
"""Deterministic-GUID seed loader for Dataverse master data.

Plan #02 implements the full logic. This plan ships the entrypoint signature only.
"""

import uuid
from pathlib import Path

UUID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "enmax-autocad")


def deterministic_id(table: str, natural_key: str) -> uuid.UUID:
    return uuid.uuid5(UUID_NAMESPACE, f"{table}|{natural_key}")


def main() -> int:
    raise NotImplementedError("Implemented in plan #02")


if __name__ == "__main__":
    raise SystemExit(main())
```

`pack.py`, `import.py`, `export.py`, `extract_master_data.py` ship as empty skeletons with a docstring naming the plan that fills them.

**Verification:**
- `cd solution/plugins/IssueNumbers && dotnet build` succeeds
- `python -m venv .venv && .venv/Scripts/activate && pip install -r solution/scripts/requirements.txt` succeeds
- `python solution/scripts/seed.py` raises `NotImplementedError` (expected)

## Step 5 — GitHub Actions workflows

Three workflow files matching PRD section 19 verbatim. Each is **functional** at this scaffold stage — they run against the empty scaffold and succeed.

**`.github/workflows/ci.yml`** — runs on every PR to `dev` or `main`:

```yaml
name: CI

on:
  pull_request:
    branches: [dev, main]
  workflow_dispatch:

jobs:
  build-and-test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: apps/code-app/package-lock.json
      - name: Install
        working-directory: apps/code-app
        run: npm ci
      - name: Lint
        working-directory: apps/code-app
        run: npm run lint
      - name: Test (Vitest)
        working-directory: apps/code-app
        run: npm test -- --coverage
      - name: Build
        working-directory: apps/code-app
        run: npm run build
      - name: Install Playwright browsers
        working-directory: apps/code-app
        run: npx playwright install chromium
      - name: Playwright (axe-core a11y)
        working-directory: apps/code-app
        run: npx playwright test --reporter=line
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'
      - name: Build plug-in (net462 via reference assemblies)
        working-directory: solution/plugins/IssueNumbers
        run: dotnet build --configuration Release
      - name: Upload build artefact
        uses: actions/upload-artifact@v4
        with:
          name: code-app-build
          path: apps/code-app/dist
          retention-days: 7
```

**`.github/workflows/cd-dev.yml`** — runs on push to `dev`:

```yaml
name: CD - Dev tenant

on:
  push:
    branches: [dev]
  workflow_dispatch:

env:
  DATAVERSE_GEO: can

jobs:
  deploy-dev:
    runs-on: windows-latest
    environment: dev
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: apps/code-app/package-lock.json
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install PAC CLI
        run: dotnet tool install --global Microsoft.PowerApps.CLI.Tool
      - name: Install Code App deps
        working-directory: apps/code-app
        run: npm ci
      - name: Build Code App
        working-directory: apps/code-app
        run: npm run build
      - name: Install Python deps
        run: pip install -r solution/scripts/requirements.txt
      - name: Pack solution
        run: python solution/scripts/pack.py
      - name: Import solution
        env:
          DATAVERSE_URL: ${{ secrets.DEV_DATAVERSE_URL }}
          DATAVERSE_CLIENT_ID: ${{ secrets.DEV_SP_CLIENT_ID }}
          DATAVERSE_CLIENT_SECRET: ${{ secrets.DEV_SP_CLIENT_SECRET }}
          DATAVERSE_TENANT_ID: ${{ secrets.DEV_TENANT_ID }}
        run: python solution/scripts/import.py
      - name: Seed deterministic master data
        env:
          DATAVERSE_URL: ${{ secrets.DEV_DATAVERSE_URL }}
          DATAVERSE_CLIENT_ID: ${{ secrets.DEV_SP_CLIENT_ID }}
          DATAVERSE_CLIENT_SECRET: ${{ secrets.DEV_SP_CLIENT_SECRET }}
          DATAVERSE_TENANT_ID: ${{ secrets.DEV_TENANT_ID }}
        run: python solution/scripts/seed.py
      - name: Publish Code App
        working-directory: apps/code-app
        env:
          POWER_APPS_ENV_ID: ${{ secrets.DEV_POWER_APPS_ENV_ID }}
        run: npx power-apps push --environmentId "$POWER_APPS_ENV_ID"
      - name: Smoke test
        working-directory: apps/code-app
        env:
          SMOKE_URL: ${{ secrets.DEV_APP_PLAY_URL }}
        run: npx playwright test --grep @smoke
```

**`.github/workflows/cd-uat.yml`** — runs on push to `main`, requires manual approval via GitHub Environments:

```yaml
name: CD - UAT tenant

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  DATAVERSE_GEO: can

jobs:
  deploy-uat:
    runs-on: windows-latest
    environment: uat   # Requires manual approval via GitHub Environments
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: apps/code-app/package-lock.json
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install PAC CLI
        run: dotnet tool install --global Microsoft.PowerApps.CLI.Tool
      - name: Install Code App deps
        working-directory: apps/code-app
        run: npm ci
      - name: Build Code App
        working-directory: apps/code-app
        run: npm run build
      - name: Install Python deps
        run: pip install -r solution/scripts/requirements.txt
      - name: Pack solution
        run: python solution/scripts/pack.py
      - name: Import solution
        env:
          DATAVERSE_URL: ${{ secrets.UAT_DATAVERSE_URL }}
          DATAVERSE_CLIENT_ID: ${{ secrets.UAT_SP_CLIENT_ID }}
          DATAVERSE_CLIENT_SECRET: ${{ secrets.UAT_SP_CLIENT_SECRET }}
          DATAVERSE_TENANT_ID: ${{ secrets.UAT_TENANT_ID }}
        run: python solution/scripts/import.py
      - name: Seed deterministic master data
        env:
          DATAVERSE_URL: ${{ secrets.UAT_DATAVERSE_URL }}
          DATAVERSE_CLIENT_ID: ${{ secrets.UAT_SP_CLIENT_ID }}
          DATAVERSE_CLIENT_SECRET: ${{ secrets.UAT_SP_CLIENT_SECRET }}
          DATAVERSE_TENANT_ID: ${{ secrets.UAT_TENANT_ID }}
        run: python solution/scripts/seed.py
      - name: Publish Code App
        working-directory: apps/code-app
        env:
          POWER_APPS_ENV_ID: ${{ secrets.UAT_POWER_APPS_ENV_ID }}
        run: npx power-apps push --environmentId "$POWER_APPS_ENV_ID"
```

**Scaffold-time behaviour:**
- `ci.yml` passes — no tests to run, no lint errors on default scaffold, build succeeds.
- `cd-dev.yml` and `cd-uat.yml` are wired but will **fail at the import step** until plan #02 lands real solution + seed YAML. This is expected and documented. Plan #02 unblocks them.

## Step 6 — Issue + PR templates

**`.github/PULL_REQUEST_TEMPLATE.md`:**

```markdown
## Summary
<!-- Two sentences max. Reference the issue. -->

Closes #

## Changes
- [ ] What changed
- [ ] Why it changed

## Verification
- [ ] Unit tests pass
- [ ] Lint passes
- [ ] Build succeeds
- [ ] Manual smoke check completed (describe below)

<!-- For plug-in changes, the second reviewer requirement applies (CLAUDE.md Rule 14). -->
```

**`.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `manual-handoff.yml`:** standard GitHub form templates with fields for spec section reference, acceptance criteria, file targets, and runbook link (for `manual-handoff`).

## Step 7 — CLAUDE.md rules 14 + 15

Append to existing `CLAUDE.md` (do not overwrite existing content):

```markdown

## Rule 14 — Concurrency-safe issuance is non-negotiable
Number issuance must go through the Dataverse custom action backed by the
plug-in. Never issue numbers from the client. Never issue numbers from a
non-transactional flow. Tests must include a concurrent-request test that
fires N parallel calls and asserts N distinct numbers.

## Rule 15 — Code Apps cannot read environment variables
Read every configuration value through the App Configuration table. Never
attempt to read a Dataverse environment variable from the Code App. Power
Automate flows may continue to use environment variables; the App Configuration
table is the Code App side of the same idea.
```

## Step 8 — Branch model + orphan branches

**Branches to create:**

| Branch | Type | Purpose | Source |
|--------|------|---------|--------|
| `main` | Protected trunk | Release branch | Exists |
| `dev` | Integration | Default PR target | Branched from `main` after scaffold lands |
| `specs` | Orphan | Spec docs + design assets | Exists |
| `runbooks` | Orphan | IT-Admin manual handoff runbooks | Created in this plan |

**Create `runbooks` orphan branch (PowerShell 7+):**

```powershell
git checkout --orphan runbooks
git rm -rf .
New-Item -ItemType Directory -Path runbooks | Out-Null

$readme = @'
# Runbooks

Manual-handoff procedures for IT Admin per PRD section 21.
This branch is an orphan; do not merge into main.

Recreate worktree with:

    git worktree add .worktrees/runbooks runbooks
'@
Set-Content -Path runbooks/README.md -Value $readme -Encoding UTF8

if (-not (Test-Path runbooks/.gitkeep)) { New-Item -ItemType File -Path runbooks/.gitkeep | Out-Null }
git add runbooks/
git commit -m "chore: initialize runbooks orphan branch"
git checkout main
```

**Document branch protection (manual GitHub UI step — not enforced from CLI in this plan):**

In `CONTRIBUTING.md`, document that `main` requires:
- Status checks: `ci` green
- Pull request reviews: 1 approval (2 for any change under `solution/plugins/`)
- Conversation resolution required
- No force-push

The actual GitHub branch protection rules are applied via the GitHub UI by the repo admin as part of runbook #009 (or a follow-up plan #01a if we want to script it via `gh api`).

## Step 9 — Secrets documentation

Create `docs/secrets.md` listing every secret consumed by CI/CD and the environment it belongs to. **Do not commit any secret values.** Format:

| Secret name | Environment | Source | Notes |
|-------------|-------------|--------|-------|
| `DEV_DATAVERSE_URL` | GitHub `dev` env | Power Platform admin | e.g. `https://orgxxxxx.crm3.dynamics.com` |
| `DEV_SP_CLIENT_ID` | GitHub `dev` env | Entra app registration | Service principal client ID |
| `DEV_SP_CLIENT_SECRET` | GitHub `dev` env | Azure Key Vault | Rotated quarterly, runbook #009 |
| `DEV_TENANT_ID` | GitHub `dev` env | Entra | ENMAX dev tenant ID |
| `DEV_POWER_APPS_ENV_ID` | GitHub `dev` env | Power Platform admin | Environment GUID for Code App push |
| `DEV_APP_PLAY_URL` | GitHub `dev` env | Power Apps | Play URL emitted after first `power-apps push` |
| `UAT_*` (same set, UAT values) | GitHub `uat` env | ENMAX IT | Runbook #009 |

Runbook #009 (`009-key-vault-secrets-and-github-environments.md`) is the authoritative procedure for populating these.

## Step 10 — README.md

Top-level README pointing at:
- Project purpose (one paragraph from PRD section 1)
- Spec + plan locations (worktree pattern from CLAUDE.md)
- Local dev quickstart (clone, `npm install`, `power-apps run` once env is bound)
- License (proprietary)
- Issue and PR conventions (link to CONTRIBUTING.md)

## Verification — End-to-End Checklist

Run from repo root in **PowerShell 7+** (pwsh). All development is on Windows; commands assume Windows paths and PowerShell syntax. **Every line must pass before the scaffold PR can merge.**

```powershell
# Workspace integrity
node --version          # >= 20
npm --version           # >= 10
python --version        # >= 3.11
dotnet --version        # >= 10 (build host SDK; plug-in itself targets net462)
pac --version           # PAC CLI installed for `pac plugin init` and solution pack

# Node workspace
npm install
Set-Location apps/code-app
npm run lint
npm test
npm run build
Set-Location ../..

# Python tooling
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r solution/scripts/requirements.txt
python -c "import yaml, requests; print('ok')"
deactivate

# .NET plug-in
Set-Location solution/plugins/IssueNumbers
dotnet build
Set-Location ../../..

# Git state
git status                                       # only intended additions
git log --oneline -1                             # scaffold commit on feat branch
git branch                                       # main, feat/001-repo-scaffold (dev created post-merge)
git worktree list                                # main + specs + (later) runbooks

# CI dry-run (push branch, observe Actions tab)
git push -u origin feat/001-repo-scaffold
gh pr create --base dev --title "feat(scaffold): repo skeleton per plan #01" --body "Implements plan #01."
gh pr checks                                    # ci.yml must be green
```

**Acceptance:** PR `feat(scaffold): repo skeleton per plan #01` is green, reviewed by one human, and squash-merged into `dev`. Note: `dev` branch must be created before opening the PR — branch it from `main` immediately after creating the feature branch.

## Critical Files to Read Before Starting

| File | Why |
|------|-----|
| `CLAUDE.md` | Project rules (already on main; will be appended in Step 7) |
| `.worktrees/specs/docs/superpowers/specs/PRD-and-Architecture.md` sections 15, 18–22 | Authoritative source for tree layout, workflow names, CLAUDE.md rules verbatim |
| `.worktrees/specs/docs/superpowers/specs/2026-05-17-phase-1-cut-line-spec.md` | Scope boundary; reject any "while we're at it" temptation |
| `.worktrees/specs/docs/superpowers/specs/2026-05-17-open-questions-decision-memo.md` | Locked decisions (prefixes, region, licensing, mailbox) |

## Downstream Plans Unblocked by This Plan

| Plan | Unblocked? | Why |
|------|------------|-----|
| #02 Dataverse schema + seed | Yes | Needs `solution/src/`, `solution/seed/`, `solution/scripts/seed.py` skeleton. ✅ |
| #03 IssueNumbers plug-in | Yes | Needs `solution/plugins/IssueNumbers/` .NET project. ✅ |
| #04 Code App shell | Partial | Needs `apps/code-app/` scaffold. ✅ for workspace. `power-apps init` deferred to plan #04 since it requires env ID. |
| #05+ feature plans | Yes | All assume scaffold and CI exist. ✅ |

## Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| Plug-in built against wrong target framework (e.g. net6.0, net8.0, netstandard2.0) | `pac plugin init` generates net462 by default; csproj review in PR template enforces it; CI builds the plug-in on every PR so regressions surface immediately. Dataverse will reject non-net462 assemblies at registration with an obscure load error — catch it in CI, not at deploy. |
| Vite + Power Apps SDK version drift breaks scaffold | Pin exact versions in `package.json` (no `^`); revisit in plan #04 when wiring to a real env. |
| Dev / CI OS mismatch | All development is on Windows; all GitHub Actions runners pinned to `windows-latest` for parity. Trade-off: Windows runner minutes cost ~2× Linux. Acceptable for Phase 1 scope. Benefits: native .NET Framework 4.6.2 build (no reference-assembly workaround required, though the NuGet pkg is kept as belt-and-braces), native PAC CLI, native file path semantics. Documented in CONTRIBUTING.md. |
| `cd-dev.yml` fails post-merge because no real solution exists | Expected and documented. Plan #02 ships first real solution + seed, unblocking `cd-dev.yml`. Interim: disable scheduled deploys, run only on manual dispatch until #02 lands. |
| PAC CLI installation slow in CI | Cache the `.dotnet/tools` directory keyed off the workflow file hash. Acceptable to defer to first deploy that demonstrates slowness; not blocking. |
| Branch protection not enforced from CLI | Documented as runbook follow-up; main is the only protected branch and the repo admin applies it via UI after first scaffold merge. |

## TODOs Left in This Plan

- **LICENSE final wording:** Placeholder text in Step 1; ENMAX legal to confirm exact one-paragraph copyright statement before public PR.
- **Branch protection rules:** Applied via GitHub UI by repo admin; this plan documents the requirement but does not enforce. Consider scripted enforcement via `gh api` in a follow-up plan if reproducibility across environments matters.
- **Runbook content:** Plan creates the orphan `runbooks` branch with a README only. Runbook authoring (10 documents per PRD section 21) is a parallel track owned by IT Admin + Architect.
