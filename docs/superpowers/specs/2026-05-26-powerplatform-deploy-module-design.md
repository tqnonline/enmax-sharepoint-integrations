# PowerPlatform.Deploy — Module Design

**Goal:** Refactor every deploy script (3 PowerShell, 8 Python — ~3,400 lines) into a cohesive, Microsoft-quality tooling surface: a PowerShell module `PowerPlatform.Deploy` and a Python package `powerplatform_deploy` (CLI `pp-deploy`), each sharing ONE auth/config/REST core, with comment-based help / docstrings, recognizable switches, tests, docs, and documented stubs for SharePoint + Power Automate. Generic, reusable scaffolding; this project's identity lives in a config profile.

**Status:** Approved 2026-05-26 (assessment + 4 scoping decisions). Build to run subagent-driven from a fresh session.

## Decisions (locked)
| Topic | Decision |
|---|---|
| Languages | Keep PS + Python split; modularize both (PS owns pac/plugins/Code-App; Python owns Dataverse REST + YAML schema/seed/roles) |
| Naming | Generic scaffolding. PS module `PowerPlatform.Deploy`, noun prefix **`Pp`** (`*-Pp*`); Python package `powerplatform_deploy`, CLI `pp-deploy` |
| Reusability | Polish in-place. Repo IS the reference model; project identity via `deploy.profile.yaml` |
| Scope | Full: shared cores + cmdlets/CLI + help/docstrings + common switches + Pester + pytest + docs + SharePoint/flow stubs |
| Identity | `deploy.profile.yaml`: publisher/entity prefix `enmax_acdn`, table manifest (24 tables), BU `enmax-autocad-app`, solution name, security_roles.yaml path, Code-App dataSources |

## Current state / why
Auth, `.env`/`DATAVERSE_*` loading, and the Dataverse REST client are re-implemented in nearly every file (`deploy-plugins.ps1` MSAL token; `push-to-dev.ps1` pac auth; `provision_roles`/`provision_schema`/`seed`/`patch_optionsets`/`extract_master_data` each carry their own client + env-load). No PS module/manifest; names aren't Verb-Noun; help is inconsistent; no `-WhatIf`/`-Confirm`; Python has no package/CLI; no tests. `-Environment` is the only consistent switch today.

## Architecture (in-place)
```
scripts/PowerPlatform.Deploy/
  PowerPlatform.Deploy.psd1            # manifest: version, FunctionsToExport, HelpInfoURI
  PowerPlatform.Deploy.psm1            # dot-sources Public/ + Private/, exports Public
  Public/   Connect-PpDataverse.ps1  Invoke-PpDeploy.ps1
            Publish-PpCodeApp.ps1     Register-PpPlugins.ps1
  Private/  Get-PpEnvConfig.ps1  Get-PpProfile.ps1  Write-PpLog.ps1  Assert-PpExitCode.ps1
  Tests/    *.Tests.ps1                # Pester
solution/scripts/
  powerplatform_deploy/
    __init__.py  cli.py                # typer app -> pp-deploy <cmd>
    client.py                          # DataverseClient: token (azure-identity/msal) + get/post, fail-loud error body
    config.py logging.py
    commands/  schema.py import_.py export.py pack.py seed.py roles.py
               optionsets.py extract.py sharepoint.py flows.py
    tests/                             # pytest
  pyproject.toml                       # [project.scripts] pp-deploy = "powerplatform_deploy.cli:app"
deploy.profile.yaml                    # PROJECT identity (see Decisions)
docs/deploy/  README.md  reference.md  examples.md
```

## Surface (one pattern, both languages)
PowerShell cmdlets (← current script):
- `Connect-PpDataverse -Environment <env>` — pac auth create/select (← push-to-dev auth block) + token for REST
- `Invoke-PpDeploy -Environment <env> [-WhatIf]` — full chain orchestrator (← deploy-local.ps1)
- `Publish-PpCodeApp -Environment <env>` — build + power.config + power-apps push (← push-to-dev.ps1)
- `Register-PpPlugins -Environment <env>` — assembly + Custom API/step registration (← deploy-plugins.ps1)

Python CLI `pp-deploy <command> --environment <env> [--dry-run] [--verbose]` (← current script):
- `schema` (← provision_schema.py) `pack` (← pack.py) `import` (← import.py) `export` (← export.py)
- `seed` (← seed.py) `roles` (← provision_roles.py) `optionsets` (← patch_optionsets.py) `extract` (← extract_master_data.py)
- `sharepoint` (NEW stub) `flows` (NEW stub)

Common switches everywhere: `-Environment`/`--environment`, `-WhatIf`/`--dry-run`, `-Verbose`/`--verbose`, `-Confirm` (PS state-changers).

## Shared cores (the biggest win — dedupe)
- **PS** `Private/`: `Get-PpEnvConfig -Environment` (reads `apps/code-app/.env.<env>`, worktree fallback, maps to DATAVERSE_*); `Connect-PpDataverse` (idempotent pac auth); `Write-PpLog` (consistent Write-Verbose/Information); `Assert-PpExitCode`.
- **Python** `client.py`: single `DataverseClient` (service-principal token, `get`/`post` that **surface the Dataverse error body** — fail-loud, Rule 12); `config.py` (env + profile load); `logging.py` (UTF-8 stdout, structured). All commands import these; no per-file auth/REST.

## Migration / rewire
- CD `cd-{dev,uat,prod}.yml`: keep granular steps for log visibility, each calling the new surface (e.g. `pp-deploy import --environment dev`, `Register-PpPlugins -Environment dev`). The recent fixes (#10–#14: pac auth, BU find-or-create, async import, utf-8, ReplacePrivilegesRole bound/enum) move INTO the cores — preserve them.
- `deploy-local.ps1` becomes a thin wrapper over `Invoke-PpDeploy` (or is removed; keep one release as a shim). `push-to-dev.ps1`/`deploy-plugins.ps1` likewise become shims or are folded into cmdlets.
- **Behavior-preserving**: validate via the local e2e (`Invoke-PpDeploy -Environment dev`) against dev — must match the green run already achieved this session.

## Phasing
1. Shared cores (PS Private/, Python client/config/logging) — dedupe.
2. Wrap existing logic into cmdlets/subcommands, no behavior change.
3. Comment-based help + `.EXAMPLE` + docstrings + type hints + common switches.
4. Repoint CD workflows + deploy-local to the new surface.
5. Pester + pytest.
6. docs/deploy/ + SharePoint/flow stubs.

## Tests
- **Pester**: `Get-PpEnvConfig` parsing + worktree fallback; param validation; `-WhatIf` is a no-op; mock `pac` for `Connect-PpDataverse`.
- **pytest**: `DataverseClient` surfaces error body on non-2xx; config/profile load; per-command request shaping; regressions — `ReplacePrivilegesRole` bound URL + `PrivilegeDepth` enum-name string, `$skip` never sent (paging), find-or-create BU.

## SharePoint / Power Automate stubs (documented)
- `commands/sharepoint.py` — interface for provisioning document libraries per Asset–Unit (plan-11 B4). Stub: validated args + clear `NotImplemented` + docstring of intended Graph/SP REST calls.
- `commands/flows.py` — flow enable/connection-reference wiring (pac solution already imports flow definitions). Stub with intended interface.

## Success criteria
- Zero duplicated auth/env/REST across scripts.
- `Get-Help <cmdlet> -Examples` works for every cmdlet; `pp-deploy --help` lists all subcommands with help.
- CD (dev) green via the new surface; local `Invoke-PpDeploy -Environment dev` reproduces the validated e2e.
- Pester + pytest pass in CI.
- docs/deploy published; stubs present with documented interfaces.

## Out of scope
Code App feature changes; Dataverse schema changes; building the real SharePoint/flow logic (stubs only this round).
