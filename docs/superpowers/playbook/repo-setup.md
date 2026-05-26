# Repository Setup

This file covers how to bootstrap a new git repository for a Power Platform solution built with the tools and conventions in this playbook. It is intentionally generic. Project-specific values are shown in callouts.

For naming conventions see [naming-conventions.md](./naming-conventions.md). For deployment commands see [deployment-and-cicd.md](./deployment-and-cicd.md). For the agentic Claude Code configuration that lives inside `.claude/` see [claude-code-copilot-setup.md](./claude-code-copilot-setup.md).

---

## Recommended Directory Layout

```
<repo-root>/
|
|-- apps/
|   `-- code-app/              <- Power Apps Code App (React/TypeScript)
|       |-- src/
|       |-- power.config.json  <- generated per-env by Publish-PpCodeApp
|       |-- package.json
|       |-- vite.config.ts
|       |-- playwright.config.ts
|       `-- .env.dev           <- GITIGNORED; local credentials
|
|-- solution/
|   |-- <SolutionName>.cdsproj <- cdsproj project (from pac solution clone)
|   |-- src/                   <- source of truth for the Dataverse solution
|   |   |-- Other/
|   |   |   |-- Solution.xml
|   |   |   |-- Customizations.xml   <- Workflow registrations + component index
|   |   |   `-- Relationships.xml
|   |   |-- Workflows/               <- cloud-flow JSON (one file per flow)
|   |   |-- Entities/                <- table/column/form XML
|   |   |-- ConnectionReferences/    <- connection reference component XML
|   |   |-- EnvironmentVariableDefinitions/
|   |   `-- ...
|   |-- plugins/
|   |   `-- <Publisher>.<Product>/   <- C# plugin project
|   |       |-- <Publisher>.<Product>.csproj
|   |       `-- *.cs
|   |-- seed/
|   |   |-- security_roles.yaml      <- role/privilege matrix (idempotent)
|   |   `-- seed.py                  <- deterministic seed data script
|   `-- scripts/
|       `-- powerplatform_deploy/    <- Python package (pp-deploy CLI)
|
|-- scripts/
|   |-- PowerPlatform.Deploy/        <- PowerShell module
|   |   |-- PowerPlatform.Deploy.psd1
|   |   `-- Public/
|   |       |-- Connect-PpDataverse.ps1
|   |       |-- Register-PpPlugins.ps1
|   |       |-- Publish-PpCodeApp.ps1
|   |       `-- Invoke-PpDeploy.ps1
|   |-- deploy-local.ps1             <- thin shim: calls Invoke-PpDeploy
|   |-- push-to-dev.ps1              <- thin shim: calls Publish-PpCodeApp
|   `-- deploy-plugins.ps1           <- thin shim: calls Register-PpPlugins
|
|-- settings/
|   |-- dev.settings.json            <- deployment settings for dev env
|   |-- uat.settings.json
|   `-- prod.settings.json
|
|-- docs/
|   |-- superpowers/
|   |   |-- playbook/                <- this playbook (on specs branch)
|   |   `-- plans/                   <- implementation plans (on specs branch)
|   `-- deploy/                      <- cmdlet/CLI reference
|
|-- .github/
|   `-- workflows/
|       |-- deploy-dev.yml
|       |-- deploy-uat.yml
|       `-- deploy-prod.yml
|
|-- .claude/                         <- Claude Code / Copilot config
|   |-- settings.json                <- permissions, hooks, MCP servers
|   |-- agents/                      <- subagent persona files
|   `-- commands/                    <- slash command scripts
|
|-- deploy.profile.yaml              <- project identity (prefix, solution, BU)
|-- .gitignore
`-- CLAUDE.md                        <- repo-level operating contract for agents
```

> **Worked example (this repo):** Code App at `apps/code-app/`. Solution at `solution/` with plugin project `solution/plugins/IssueNumbers/`. PowerShell module at `scripts/PowerPlatform.Deploy/`. Python package at `solution/scripts/powerplatform_deploy/`. Profile at `deploy.profile.yaml` with `entity_prefix: enmax_acdn`, `solution_name: EnmaxAutoCADNumbering`.

---

## .gitignore Essentials

```
# Credentials — never commit
.env*
*.secrets.json
power.config.json          # generated per-env; contains environment/app GUIDs

# Build artifacts
dist/
out/
node_modules/
bin/
obj/
*.zip                      # packed solution zips are build artifacts
__pycache__/
*.pyc
.venv/
.pytest_cache/

# Worktrees (design/plan docs on orphan branch)
.worktrees/

# IDE
.vs/
.vscode/settings.json
*.user

# pac CLI
.cache/
```

The most important rule: **never commit `.env*` files or `*.secrets.json`.** CI injects credentials as GitHub Actions secrets named `DATAVERSE_*`. See [README.md](./README.md) §6 for the full credential layout.

---

## Orphan `specs` Branch and Git Worktree Pattern

Design documents, implementation plans, and this playbook live on an **orphan branch** called `specs`. This branch has no common history with `main`/`dev` — it exists solely to version documentation without polluting the code history.

### Initial setup (one-time per repo)

```bash
# Create the orphan branch and initial commit
git checkout --orphan specs
git rm -rf .          # clear working tree (this branch has no code)
mkdir -p docs/superpowers/specs docs/superpowers/plans docs/superpowers/playbook
echo "# Specs" > docs/superpowers/specs/README.md
git add docs/
git commit -m "chore: init specs orphan branch"
git push origin specs
git checkout dev      # return to dev
```

### Worktree access from the main checkout

```bash
# Mount the specs branch as a worktree at .worktrees/specs
git worktree add .worktrees/specs specs
```

The `.worktrees/` directory is gitignored (in the main branch) so it does not pollute the code repository. After this command, agents and developers can read and write docs directly:

```
.worktrees/specs/docs/superpowers/specs/<specname>.md
.worktrees/specs/docs/superpowers/plans/<plan-name>.md
.worktrees/specs/docs/superpowers/playbook/<file>.md
```

### Recreating the worktree

If the worktree is missing (e.g. on a new clone), recreate it:

```bash
git worktree add .worktrees/specs specs
```

If `specs` branch does not exist locally after cloning:

```bash
git fetch origin specs:specs
git worktree add .worktrees/specs specs
```

---

## Branch Strategy

```
main (or master)   <- stable production code; protected; PRs only
  |
  |-- dev          <- active development; direct push allowed for owners
  |     |
  |     |-- feat/NNN-description   <- feature branches for non-trivial work
  |     |-- fix/NNN-description    <- bug-fix branches
  |     `-- chore/NNN-description  <- tooling/infra branches
  |
  |-- uat          <- UAT environment; populated by CD from main
  `-- prod         <- production; populated by CD from main (change-controlled)

specs (orphan)     <- design + plan docs only; no code
```

### Git worktrees for parallel feature work

Use `git worktree add` to work on multiple features simultaneously without stashing:

```bash
git worktree add .worktrees/feat-NNN origin/feat/NNN-description
```

Each worktree has its own working tree and HEAD. The `.worktrees/` directory is gitignored. When deploying from a worktree, be aware of `$PSScriptRoot` resolution — see [deployment-and-cicd.md](./deployment-and-cicd.md) for the worktree deploy pattern.

---

## Credential Bootstrap

### Step 1: Create an Azure AD App Registration

```
Azure Portal -> Azure Active Directory -> App registrations -> New registration
  Display name: <Solution>-deploy-<env>   (e.g. "MySolution-deploy-dev")
  Supported account types: Single tenant
  Redirect URI: leave blank

After creation:
  Certificates & secrets -> New client secret -> copy value immediately
  API permissions -> Add permission -> Dynamics CRM -> Delegated -> user_impersonation
  -> Grant admin consent for <tenant>
```

Note these three values — you will use them everywhere:

| Variable | Where to find it |
|----------|-----------------|
| `DATAVERSE_TENANT_ID` | Azure AD -> Overview -> Tenant ID |
| `DATAVERSE_CLIENT_ID` | App registration -> Overview -> Application (client) ID |
| `DATAVERSE_CLIENT_SECRET` | The value copied from Certificates & secrets |

### Step 2: Create an Application User in each Dataverse environment

```
Power Platform Admin Center -> Environments -> <env> -> Settings
  -> Users + Permissions -> Application Users -> New app user
  -> Associate to the app registration created above
  -> Assign security role: System Administrator (for deploy) or a custom deploy role
```

### Step 3: Use pac CLI to automate (optional)

`pac admin create-service-principal --environment <env-id>` creates the Entra app registration, application user, and assigns System Administrator in one shot. Useful for scripted setup. Override the role with `--role` if you want a least-privilege deploy role.

### Step 4: Bootstrap pac auth

```powershell
pac auth create `
  --name dev `
  --url https://<org>.crm.dynamics.com `
  --applicationId <DATAVERSE_CLIENT_ID> `
  --clientSecret <DATAVERSE_CLIENT_SECRET> `
  --tenant <DATAVERSE_TENANT_ID>

pac auth who   # always confirm before state-changing commands
```

---

## Local Credential Files (`.env.<env>`)

Store per-environment credentials locally in `.env.<env>` files. These are gitignored and never committed.

```
# .env.dev  (lives at apps/code-app/.env.dev in this project's layout)
ENVIRONMENT_URL=https://<org>.crm.dynamics.com
CLIENT_ID=<service-principal-app-id>
CLIENT_SECRET=<service-principal-secret>
TENANT_ID=<aad-tenant-id>
ENVIRONMENT_ID=<power-platform-environment-guid>
APP_ID=<code-app-guid>              # only if the project has a Code App
APP_DISPLAY_NAME=<code-app-name>    # only if the project has a Code App
```

The deploy tooling also recognizes `DATAVERSE_*`-prefixed names (the CI convention) and normalizes both alias sets.

### CI/CD credentials

In GitHub Actions, inject credentials as repository secrets. Do not read `.env` files in CI — the tooling detects `DATAVERSE_*` environment variables and skips file parsing:

```yaml
env:
  DATAVERSE_URL:           ${{ secrets.DEV_DATAVERSE_URL }}
  DATAVERSE_CLIENT_ID:     ${{ secrets.DEV_SP_CLIENT_ID }}
  DATAVERSE_CLIENT_SECRET: ${{ secrets.DEV_SP_CLIENT_SECRET }}
  DATAVERSE_TENANT_ID:     ${{ secrets.DEV_TENANT_ID }}
```

---

## deploy.profile.yaml

A single YAML file at the repo root holds project identity. The deploy tooling reads this file to know the customization prefix, solution name, business unit, and table list.

```yaml
entity_prefix: pub          # customization prefix (without trailing _)
solution_name: MySolution   # Dataverse solution unique name
business_unit: pub-app-bu   # BU name for role provisioning
security_roles_file: solution/seed/security_roles.yaml
tables:
  - pub_mytable
  - pub_anothertable
  - pub_appconfig
```

Commit this file. It does not contain credentials. Every project has exactly one `deploy.profile.yaml`. To reuse the deploy tooling for a new project, copy the module/package and update this file.

> **Worked example (this repo):** `entity_prefix: enmax_acdn`, `solution_name: EnmaxAutoCADNumbering`, `business_unit: enmax-autocad-app`.

---

## Publisher and Solution Setup

After the repo is created and auth is bootstrapped, create the publisher and solution in Power Platform:

```
Power Platform maker portal -> Solutions -> New solution
  Display name: <YourSolution> (PascalCase noun phrase)
  Name (unique): <SolutionUniqueName>
  Publisher: create or select existing
    Display name: <Publisher>
    Name: <publisher>
    Prefix: pub   (your customization prefix, 2-8 lowercase letters)
```

Then clone it into the repo:

```bash
pac solution clone --name <SolutionUniqueName> --outputDirectory ./solution
```

This sets up the `cdsproj` structure under `solution/`. Commit the result. From this point, all changes to the solution happen through source control and `pac solution pack` + `pac solution import`.

See [naming-conventions.md](./naming-conventions.md) for the full naming reference. See [deployment-and-cicd.md](./deployment-and-cicd.md) for the full deploy chain.
