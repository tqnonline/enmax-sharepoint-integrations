# Deploy Tooling — Examples

All PowerShell examples assume the module is already imported:
```powershell
Import-Module scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1
```

All `pp-deploy` examples assume the package is installed (`uv pip install -e solution/scripts`) and `PYTHONUTF8=1` is set on Windows to avoid encoding errors.

---

## Dev Environment

### Full chain — dev

Runs all 8 deploy steps (pac auth, pack, import, plugins, optionsets, seed, roles, Code App) against the dev environment. Reads credentials from `code-app/.env.dev`.

```powershell
Invoke-PpDeploy -Environment dev
```

### Dry-run preview — dev

Previews the full chain without writing to Dataverse or Power Apps. PowerShell sub-cmdlets print ShouldProcess messages; Python CLI steps log without executing.

```powershell
Invoke-PpDeploy -Environment dev -WhatIf
```

### Individual steps — dev

Register plugins only (e.g. after a plugin-only change):

```powershell
Register-PpPlugins -Environment dev
```

Register plugins, skipping the dotnet build (DLL already built):

```powershell
Register-PpPlugins -Environment dev -SkipBuild
```

Publish Code App only (e.g. after a UI-only change):

```powershell
Publish-PpCodeApp -Environment dev
```

Pack solution zip:

```
python -m powerplatform_deploy.cli pack --environment dev
```

Seed master data, dry-run preview:

```
python -m powerplatform_deploy.cli seed --environment dev --dry-run
```

Seed master data for real:

```
python -m powerplatform_deploy.cli seed --environment dev
```

Patch option set labels:

```
python -m powerplatform_deploy.cli optionsets --environment dev
```

Provision schema:

```
python -m powerplatform_deploy.cli schema --environment dev
```

Extract master data from Excel to YAML (offline, no Dataverse credentials needed):

```
python -m powerplatform_deploy.cli extract --environment dev
python -m powerplatform_deploy.cli extract --environment dev --workbook "solution/seed/Master data.xlsx"
```

Export current solution state from dev and unpack to `solution/src/`:

```
python -m powerplatform_deploy.cli export --environment dev
```

---

## UAT Environment

### Full chain — uat

```powershell
Invoke-PpDeploy -Environment uat
```

### Dry-run preview — uat (using `-WhatIf`)

```powershell
Invoke-PpDeploy -Environment uat -WhatIf
```

### Dry-run preview — uat (using `-DryRun`, equivalent; useful in scripted contexts)

```powershell
Invoke-PpDeploy -Environment uat -DryRun
```

### Individual steps — uat

Register plugins in uat:

```powershell
Register-PpPlugins -Environment uat
```

Provision security roles in uat:

```
python -m powerplatform_deploy.cli roles --environment uat
```

---

## Prod Environment

### Full chain — prod

```powershell
Invoke-PpDeploy -Environment prod
```

### Provision security roles — prod

```
python -m powerplatform_deploy.cli roles --environment prod
```

### Patch option sets — prod

```
python -m powerplatform_deploy.cli optionsets --environment prod --dry-run
python -m powerplatform_deploy.cli optionsets --environment prod
```

---

## CI/CD Invocation

In GitHub Actions (`.github/workflows/cd-{dev,uat,prod}.yml`), each step is called individually for log granularity. `DATAVERSE_*` secrets are injected per-step from the GitHub Actions environment; no `.env` file is present. `PYTHONUTF8: '1'` is set at the job level.

Example (from `cd-dev.yml`):

```yaml
env:
  PYTHONUTF8: '1'

steps:
  - name: Pack solution
    env:
      DATAVERSE_URL: ${{ secrets.DEV_DATAVERSE_URL }}
      DATAVERSE_CLIENT_ID: ${{ secrets.DEV_SP_CLIENT_ID }}
      DATAVERSE_CLIENT_SECRET: ${{ secrets.DEV_SP_CLIENT_SECRET }}
      DATAVERSE_TENANT_ID: ${{ secrets.DEV_TENANT_ID }}
    run: python -m powerplatform_deploy.cli pack --environment dev

  - name: Register plugins & Custom APIs
    shell: pwsh
    env:
      DATAVERSE_URL: ${{ secrets.DEV_DATAVERSE_URL }}
      DATAVERSE_CLIENT_ID: ${{ secrets.DEV_SP_CLIENT_ID }}
      DATAVERSE_CLIENT_SECRET: ${{ secrets.DEV_SP_CLIENT_SECRET }}
      DATAVERSE_TENANT_ID: ${{ secrets.DEV_TENANT_ID }}
    run: |
      Import-Module ./scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1 -Force
      Register-PpPlugins -Environment dev
```

The Python package's `load_env` module detects that `DATAVERSE_*` variables are already set in the environment and skips `.env` file parsing — no credential file is needed or read in CI.
