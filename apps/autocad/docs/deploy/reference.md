# Deploy Tooling — Reference

## PowerShell Cmdlets

Import the module before calling any cmdlet:
```powershell
Import-Module scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1
```

---

### Connect-PpDataverse

**Synopsis:** Authenticates the pac CLI against a Power Platform environment.

**Syntax:**
```
Connect-PpDataverse [-Environment] <String> [-WhatIf] [-Confirm] [<CommonParameters>]
```

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `-Environment` | String | Yes | Environment name matching a `.env.<Environment>` file, e.g. `dev`, `uat`. |
| `-WhatIf` | Switch | No | Shows what `pac auth create` would do without executing it. |

**Description:** Loads credentials from `.env.<Environment>` via `Get-PpEnvConfig`, then idempotently ensures the pac CLI has an auth profile for that environment. Steps: (1) calls `pac auth list`; (2) if the environment URL is not already listed, creates a new auth profile with `pac auth create` (guarded by `-WhatIf`); (3) selects index 1 so the profile is active for subsequent pac commands.

**Notes:** Requires pac CLI installed as a dotnet global tool. Credentials are read from `code-app\.env.<Environment>` with a git-worktree fallback to the main repo checkout.

**Examples:**

```powershell
# Authenticate against the dev environment; creates auth profile if not present.
Connect-PpDataverse -Environment dev

# Show what pac auth create would do without creating the profile.
Connect-PpDataverse -Environment uat -WhatIf
```

---

### Register-PpPlugins

**Synopsis:** Build the Enmax.AutoCAD plugin DLL and idempotently register all Custom APIs and plugin steps in the target Dataverse environment.

**Syntax:**
```
Register-PpPlugins [-Environment] <String> [-SkipBuild] [-WhatIf] [-Confirm] [<CommonParameters>]
```

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `-Environment` | String | Yes | Environment name matching a `.env.<Environment>` file, e.g. `dev`, `uat`. Used when `DATAVERSE_*` env vars are absent. |
| `-SkipBuild` | Switch | No | Skip the `dotnet build` step. DLL must already exist at the expected path. |
| `-WhatIf` | Switch | No | Performs all GET read checks without making any state changes. |

**Description:** (1) Resolves credentials — `DATAVERSE_*` env vars take precedence over `.env` file (mirrors CI). (2) Builds `solution\plugins\IssueNumbers\IssueNumbers.csproj` (Release) unless `-SkipBuild`. (3) Acquires an OAuth2 client_credentials token. (4) Finds the pre-registered `Enmax.AutoCAD` plugin assembly and PATCHes its content with the freshly-built DLL. (5) Idempotently registers all Custom APIs (GET-then-POST) and their request parameters / response properties. (6) Idempotently registers all standard plugin steps and their images. Definitions are loaded from `Data\PluginDefinitions.psd1`.

**Notes:** The plugin assembly `Enmax.AutoCAD` must be pre-registered via Plugin Registration Tool before the first run. This cmdlet updates an existing assembly record; it will error (fail-loud) if the assembly is absent.

**Examples:**

```powershell
# Build the plugin and register all Custom APIs + steps in the dev environment.
Register-PpPlugins -Environment dev

# Perform all GET checks without making any changes. Safe for pre-deploy validation.
Register-PpPlugins -Environment dev -WhatIf

# Skip the dotnet build and go straight to registration (DLL must already exist).
Register-PpPlugins -Environment dev -SkipBuild
```

---

### Publish-PpCodeApp

**Synopsis:** Build the Power Apps Code App and push it to a target Power Platform environment.

**Syntax:**
```
Publish-PpCodeApp [-Environment] <String> [-WhatIf] [-Confirm] [<CommonParameters>]
```

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `-Environment` | String | Yes | Environment name matching a `.env.<Environment>` file, e.g. `dev`, `uat`. |
| `-WhatIf` | Switch | No | Shows what would happen without writing files, running npm, or calling pac. |

**Description:** (1) Loads credentials from `.env.<Environment>`. (2) Ensures pac CLI is authenticated via `Connect-PpDataverse` (idempotent). (3) Writes `code-app\power.config.json` with environment-specific configuration including the full `databaseReferences` `dataSources` map (25 Dataverse entity sets). (4) Runs `npm run build` in `code-app`. (5) Runs `npx power-apps push --non-interactive`. (6) Prints the play URL. Steps 3–5 are guarded by `-WhatIf`.

**Notes:** Requires pac CLI and Node.js + npm on PATH.

**Examples:**

```powershell
# Build and publish the Code App to the dev Power Platform environment.
Publish-PpCodeApp -Environment dev

# Show what would happen without writing files, running npm, or calling pac.
Publish-PpCodeApp -Environment dev -WhatIf
```

---

### Invoke-PpDeploy

**Synopsis:** Run the full 8-step deploy chain against a target Power Platform environment.

**Syntax:**
```
Invoke-PpDeploy [-Environment] <String> [-DryRun] [-WhatIf] [-Confirm] [<CommonParameters>]
```

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `-Environment` | String | Yes | Environment name matching a `.env.<Environment>` credential file, e.g. `dev`, `uat`. |
| `-DryRun` | Switch | No | Passes `--dry-run` to every Python CLI step and activates `-WhatIf` for PowerShell sub-cmdlets. |
| `-WhatIf` | Switch | No | PowerShell standard dry-run; propagates to sub-cmdlets automatically. Python steps also receive `--dry-run`. |

**Description:** Orchestrates the complete end-to-end deployment in order: (1) `Connect-PpDataverse` — pac auth; (2) `pp-deploy pack`; (3) `pp-deploy import`; (4) `Register-PpPlugins`; (5) `pp-deploy optionsets`; (6) `pp-deploy seed`; (7) `pp-deploy roles`; (8) `Publish-PpCodeApp`. Credentials are loaded from `.env.<Environment>` and exported as `DATAVERSE_*` environment variables so Python subprocesses inherit them. Supersedes `scripts/deploy-local.ps1`.

**Notes:** Order is critical — solution import must complete before plugin registration; seed and roles must follow option-set patching; Code App must be published last.

**Examples:**

```powershell
# Run the full 8-step deploy chain against the dev environment.
Invoke-PpDeploy -Environment dev

# Dry-run the deploy: sub-cmdlets show ShouldProcess output; Python steps receive --dry-run.
Invoke-PpDeploy -Environment uat -WhatIf

# Explicit dry-run flag, useful in CI pipelines where -WhatIf is harder to surface.
Invoke-PpDeploy -Environment uat -DryRun
```

---

## pp-deploy Subcommands

Install the package: `uv pip install -e solution/scripts`

Common options available on every subcommand:

| Option | Short | Description |
|---|---|---|
| `--environment TEXT` | `-e` | Target environment (e.g. `dev`, `uat`, `prod`). Required. |
| `--dry-run / --no-dry-run` | | Log the intended command but do not execute it. |
| `--verbose / --no-verbose` | `-v / -V` | Emit DEBUG-level log output. |

Note: when running outside a TTY (e.g. piped or redirected), Typer/Rich produces no styled output. Run interactively or set `PYTHONUTF8=1` to avoid encoding errors on Windows.

---

### pack

Pack `solution/src/` into `solution/build/EnmaxAutoCADNumbering_unmanaged.zip`.

Uses `pac solution pack`. Run before `import` to build the solution artifact.

```
pp-deploy pack --environment dev
pp-deploy pack --environment dev --dry-run
```

---

### import

Import the packed solution zip into the target Dataverse environment.

Uses `pac solution import --publish-changes --activate-plugins --async --max-async-wait-time 60`. The `--async` flag is required to avoid a 30-minute channel timeout during upgrade imports.

```
pp-deploy import --environment dev
pp-deploy import --environment uat --dry-run
```

---

### export

Export the unmanaged solution from the environment and unpack to `solution/src/`.

Two-step: `pac solution export` then `pac solution unpack`. Run after every maker-UI schema change to produce the XML diff that goes into the PR.

```
pp-deploy export --environment dev
pp-deploy export --environment dev --dry-run
```

---

### roles

Provision Dataverse security roles from `seed/security_roles.yaml`.

Reads role definitions + BU name from the seed file. Idempotent: existing roles are updated in-place via `ReplacePrivilegesRole` (bound action). Run after solution import and seed.

```
pp-deploy roles --environment dev
pp-deploy roles --environment prod --dry-run
```

---

### seed

Seed Dataverse master data from `solution/seed/` YAML files.

Delegates to `solution/scripts/seed.py`. On `--dry-run`, prints PATCH payloads without writing to Dataverse.

```
pp-deploy seed --environment dev
pp-deploy seed --environment dev --dry-run
```

---

### optionsets

Patch Dataverse global option set labels to match the solution XML definitions.

Delegates to `solution/scripts/patch_optionsets.py`. On `--dry-run`, prints planned patches without applying them.

```
pp-deploy optionsets --environment dev
pp-deploy optionsets --environment dev --dry-run
```

---

### schema

Provision Dataverse schema (tables, columns, relationships, option sets).

Delegates to `solution/scripts/provision_schema.py`. Idempotent: safe to re-run. On `--dry-run`, prints intended operations without writing to Dataverse.

```
pp-deploy schema --environment dev
pp-deploy schema --environment dev --dry-run
```

---

### extract

Extract master/reference data from Excel to YAML seed files (offline).

Delegates to `solution/scripts/extract_master_data.py`. No Dataverse credentials are required — this is a pure local transform (Excel to YAML). The `--environment` option is accepted for CLI surface consistency but unused. On `--dry-run`, logs the intended command without mutating any seed files.

Additional option:

| Option | Description |
|---|---|
| `--workbook TEXT` | Path to the Excel workbook (default: `Master data.xlsx`). |

```
pp-deploy extract --environment dev
pp-deploy extract --environment dev --workbook "path/to/Master data.xlsx"
pp-deploy extract --environment dev --dry-run
```

---

### sharepoint

Provision SharePoint document libraries per active Asset-Unit. **STUB — not yet implemented (plan-11 B4).**

On `--dry-run`, logs the intended plan. On a real run, raises `NotImplementedError` with interface documentation.

```
pp-deploy sharepoint --environment dev --dry-run
```

---

### flows

Enable and wire Power Automate flows in the imported solution. **STUB — not yet implemented.**

On `--dry-run`, logs the intended plan. On a real run, raises `NotImplementedError` with interface documentation.

```
pp-deploy flows --environment dev --dry-run
```
