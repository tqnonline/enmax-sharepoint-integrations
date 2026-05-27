# Deploy Tooling

This directory documents the deploy tooling for the Enmax AutoCAD Power Platform solution. The tooling consists of two components: a PowerShell module (`scripts/PowerPlatform.Deploy/`) that orchestrates pac CLI auth, plugin registration, and Code App publishing, and a Python package (`solution/scripts/powerplatform_deploy/`, CLI entry point `pp-deploy`) that handles Dataverse solution lifecycle operations (pack, import, export, seed, schema, roles, optionsets, extract). Project identity (solution name, entity prefix, business unit, table list) lives in `deploy.profile.yaml` at the repo root.

## Prerequisites

| Requirement | Install |
|---|---|
| PowerShell 7+ | [aka.ms/powershell](https://aka.ms/powershell) |
| Python 3.11+ | [python.org](https://www.python.org/downloads/) |
| PAC CLI | `dotnet tool install --global Microsoft.PowerApps.CLI.Tool` |
| .NET SDK | [dotnet.microsoft.com](https://dotnet.microsoft.com/download) |
| Node.js + npm | [nodejs.org](https://nodejs.org/) (version from `.nvmrc`) |
| uv | `pip install uv` |

After installing the above:

```powershell
# Install the Python deploy package (editable, from repo root)
uv pip install -e solution/scripts

# Load the PowerShell module (per session, or add to your profile)
Import-Module scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1
```

## Environment and Credentials

**Local development:** credentials are read from `apps/code-app/.env.<env>` (gitignored). The file must contain:

```
ENVIRONMENT_URL=https://org.crm3.dynamics.com
CLIENT_ID=<service principal app ID>
CLIENT_SECRET=<service principal secret>
TENANT_ID=<AAD tenant ID>
ENVIRONMENT_ID=<Power Platform environment GUID>
APP_ID=<Code App GUID>
APP_DISPLAY_NAME=<Code App display name>
```

**CI/CD:** `DATAVERSE_URL`, `DATAVERSE_CLIENT_ID`, `DATAVERSE_CLIENT_SECRET`, `DATAVERSE_TENANT_ID` are injected as GitHub Actions secrets. The Python package's `load_env` module detects these and skips `.env` file parsing entirely — no `.env` file is needed in CI. `Invoke-PpDeploy` exports these variables to the process environment so Python subprocesses inherit them.

**Never commit `.env` files or print secret values.**

## Quickstart

Full end-to-end deploy to dev (8 steps: auth, pack, import, plugins, optionsets, seed, roles, Code App):

```powershell
Import-Module scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1
Invoke-PpDeploy -Environment dev
```

Dry-run preview (no writes to Dataverse or Power Apps):

```powershell
Invoke-PpDeploy -Environment dev -WhatIf
```

## Surface Mapping

| Operation | PowerShell cmdlet | pp-deploy subcommand | Replaces (old script) |
|---|---|---|---|
| PAC CLI auth | `Connect-PpDataverse` | — | auth block in `scripts/push-to-dev.ps1` |
| Pack solution zip | — | `pp-deploy pack` | `solution/scripts/pack.py` |
| Import solution | — | `pp-deploy import` | `solution/scripts/import.py` |
| Register plugins + Custom APIs | `Register-PpPlugins` | — | `scripts/deploy-plugins.ps1` |
| Patch option set labels | — | `pp-deploy optionsets` | `solution/scripts/patch_optionsets.py` |
| Seed master data | — | `pp-deploy seed` | `solution/scripts/seed.py` |
| Provision security roles | — | `pp-deploy roles` | `solution/scripts/provision_roles.py` |
| Provision schema | — | `pp-deploy schema` | `solution/scripts/provision_schema.py` |
| Export + unpack solution | — | `pp-deploy export` | `solution/scripts/export.py` |
| Extract master data (Excel→YAML) | — | `pp-deploy extract` | `solution/scripts/extract_master_data.py` |
| Publish Code App | `Publish-PpCodeApp` | — | Code App push block in `scripts/push-to-dev.ps1` |
| Full chain (all 8 steps) | `Invoke-PpDeploy` | — | `scripts/deploy-local.ps1` |
| Provision SharePoint libraries | — | `pp-deploy sharepoint` (stub) | plan-11 B4, not yet implemented |
| Enable + wire flows | — | `pp-deploy flows` (stub) | not yet implemented |

The three old scripts (`scripts/deploy-local.ps1`, `scripts/push-to-dev.ps1`, `scripts/deploy-plugins.ps1`) are now thin shims that import the module and delegate to the corresponding cmdlets.

## CI/CD

CD workflows (`.github/workflows/cd-{dev,uat,prod}.yml`) run each deploy operation as a named step for log visibility. All workflows set `PYTHONUTF8: '1'` at the job level to prevent Rich/Typer from crashing on non-UTF-8 consoles. Python steps call `python -m powerplatform_deploy.cli <cmd> --environment <env>` directly; plugin registration calls `Register-PpPlugins` via a `shell: pwsh` step. DATAVERSE_* secrets are injected per-step from the GitHub Actions environment.

## Profile

`deploy.profile.yaml` at the repo root holds project identity used by the Python package:

- `entity_prefix` — column/table prefix (`enmax_acdn`)
- `solution_name` — Dataverse solution unique name (`EnmaxAutoCADNumbering`)
- `business_unit` — BU name for role assignment (`enmax-autocad-app`)
- `security_roles_file` — path to the YAML role definitions
- `tables` — list of all Dataverse table logical names in the solution

To reuse this tooling for another project, copy `scripts/PowerPlatform.Deploy/` and `solution/scripts/powerplatform_deploy/` and update `deploy.profile.yaml` with the new project's values.
