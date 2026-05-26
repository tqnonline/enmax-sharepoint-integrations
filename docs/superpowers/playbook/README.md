# Power Platform Development Playbook

This playbook is the canonical guide for delivering **any Power Platform application** — Code Apps, canvas apps, model-driven apps, Dataverse customizations, plugins, Custom APIs, Power Automate flows, security, and CI/CD — **agentically**, using Claude Code and GitHub Copilot.

Each file covers a distinct concern and is written to be self-contained enough to function as a composable **skill or agent prompt**. The final file (`skills-and-agents-blueprint.md`) explains how to wire them together and how each skill maps to an installable plugin in the `microsoft/power-platform-skills` format.

---

## Operating Contract — How to Use This Playbook with Claude Code and GitHub Copilot

**TL;DR for agents:**

1. `solution/src/` is the source of truth. Never edit the `.zip`. After portal edits, run `pac solution sync` and commit.
2. Run `pac auth who` before every state-changing pac command.
3. Run `pac solution check` before every `pac solution import`.
4. Code Apps cannot read Dataverse environment variables — use the `pub_appconfig` table (Rule 15).
5. Sequential number issuance must go through the Custom API + synchronous plugin (Rule 14).
6. `tsc --noEmit` is a no-op for this project's tsconfig — always use `npx tsc -b`.
7. When uncertain about pac syntax, consult the `pac-mcp` or `mslearn` MCP servers, not memory.

**For full agentic configuration** (MCP servers, `.claude/settings.json` allow/deny, subagents, hooks, slash commands, GitHub Copilot equivalents) see [claude-code-copilot-setup.md](./claude-code-copilot-setup.md).

**For repo bootstrap** (directory layout, .gitignore, orphan `specs` branch, branch strategy, credential setup, `deploy.profile.yaml`) see [repo-setup.md](./repo-setup.md).

---

## Relationship to Microsoft power-platform-skills

The Microsoft `power-platform-skills` repository (https://github.com/microsoft/power-platform-skills) is a Claude Code / GitHub Copilot plugin marketplace for Power Platform development. This playbook mirrors its plugin/skill/agent format and extends it.

- **Same format:** `plugins/<domain>/` with `plugin.json`, `AGENTS.md`, `CLAUDE.md`, `agents/<agent>.md`, `skills/<skill>/SKILL.md`, `shared/`, `references/`.
- **Extended domains:** we add `dataverse`, `security`, `plugins-customapi`, `flows`, and `deploy` — domains the MS repo does not cover.
- **Extended `code-apps`:** we add the React+Fluent v9 high-polish/branded stack (FADE_UP, `makeStyles` longhand-only, `tokens.*` color tokens, hash router, MSW v2, App Configuration table instead of env vars).
- **Key additions:** concurrency-safe sequence issuance (Rule 14), binding-type immutability, entity-bound URL namespace prefix, PYTHONUTF8, async import, `--stage-and-upgrade` first-import caveat.

See [skills-and-agents-blueprint.md](./skills-and-agents-blueprint.md) for the full mapping.

---

## Audience

Engineers building or maintaining Power Platform solutions that combine Dataverse, plugins, Custom APIs, Code Apps (React/TypeScript), model-driven apps, canvas apps, and Power Automate flows. Assumes familiarity with Azure AD, REST/OData, and one of C#/TypeScript/Python.

---

## How the Files Map to Skills

Each file in this playbook corresponds to one or more composable skills described in [skills-and-agents-blueprint.md](./skills-and-agents-blueprint.md). A skill is a scoped prompt+context bundle that an agent can load for a specific task (e.g. "provision schema", "register a Custom API", "scaffold a new Code App screen"). The files are written with this in mind: explicit prerequisites, step-by-step instructions, exact error codes, and clear success criteria.

---

## File Index

| File | One-line description |
|------|---------------------|
| `README.md` (this file) | Purpose, audience, operating contract, prerequisites, and master index |
| [repo-setup.md](./repo-setup.md) | Git repo bootstrap: directory layout, .gitignore, orphan specs branch, worktrees, branch strategy, credential bootstrap, deploy.profile.yaml |
| [claude-code-copilot-setup.md](./claude-code-copilot-setup.md) | Agentic delivery config: MCP servers, .claude/settings.json allow/deny, subagents, hooks, slash commands, GitHub Copilot equivalents |
| [naming-conventions.md](./naming-conventions.md) | Single source of truth for all naming: publisher prefix, tables, columns, option sets, APIs, flows, tooling |
| [dataverse-foundation.md](./dataverse-foundation.md) | Tables, columns, relationships, option sets, solutions, Web API rules including skip-paging and datetime gotchas |
| [security-roles-bu-teams.md](./security-roles-bu-teams.md) | Privilege model, business units, teams, ReplacePrivilegesRole bound action, idempotent provisioning |
| [plugins-and-custom-apis.md](./plugins-and-custom-apis.md) | Plugin assembly lifecycle, Custom API types, entity-bound vs global URLs, plugin steps and images, concurrency-safe issuance |
| [code-apps.md](./code-apps.md) | Power Apps Code Apps (React/TS/Fluent v9): stack, power.config.json, App Configuration table, server paging, testing, build gotchas |
| [model-driven-and-canvas-apps.md](./model-driven-and-canvas-apps.md) | MDA forms/views/sitemap, canvas delegation, environment variables, connection references, when to use each app type |
| [power-automate-flows.md](./power-automate-flows.md) | Source-of-truth discipline, pac CLI commands, flow JSON invariants, deployment settings, round-tripping, FlowRun table, testing, multi-channel notification pattern |
| [deployment-and-cicd.md](./deployment-and-cicd.md) | Full 8-step deploy chain, PowerShell module and Python CLI install/usage, async import, PYTHONUTF8, PSScriptRoot gotcha, CI/CD structure |
| [skills-and-agents-blueprint.md](./skills-and-agents-blueprint.md) | Skill catalog, plugin format (plugin.json, SKILL.md, agent.md), marketplace layout, orchestrator agents, dependency graph |

---

## Universal Prerequisites and Environment Setup

Every task in this playbook depends on the following baseline. Individual files assume this setup is complete. For step-by-step bootstrap instructions see [repo-setup.md](./repo-setup.md).

### 1. Azure AD App Registration (Service Principal)

Create one application registration per environment tier (dev/uat/prod) or share one with environment-scoped secrets.

```
Azure Portal -> Azure Active Directory -> App registrations -> New registration
  Display name: <Solution>-deploy-<env>
  Supported account types: Accounts in this organizational directory only
  Redirect URI: (leave blank for service principal use)

After creation:
  Certificates & secrets -> New client secret -> copy value immediately
  API permissions -> Add a permission -> Dynamics CRM -> Delegated -> user_impersonation
  -> Grant admin consent for <tenant>
```

Note the three values you will need everywhere:
- **Tenant ID** (`DATAVERSE_TENANT_ID`) — from Azure AD Overview
- **Client ID** (`DATAVERSE_CLIENT_ID`) — from App registration Overview, "Application (client) ID"
- **Client Secret** (`DATAVERSE_CLIENT_SECRET`) — the value you copied above

Alternatively, use `pac admin create-service-principal --environment <env-id>` to create the app registration, application user, and System Administrator assignment in one shot.

### 2. Dataverse Application User

The service principal must be registered as an application user in each Dataverse environment and granted a security role.

```
Power Platform Admin Center -> Environments -> <env> -> Settings -> Users + Permissions -> Application Users
  -> New app user -> Associate to the App Registration above
  -> Assign security role: System Administrator (for deploy) or a custom deploy role
```

### 3. Environments

Maintain at minimum three environment tiers. The naming convention and geo should match your organization's data residency requirements.

| Tier | Purpose |
|------|---------|
| dev  | Active development, frequent deploys, unmanaged solution |
| uat  | Acceptance testing, managed solution |
| prod | Production, managed solution, change-controlled |

### 4. Tooling

Install these once per developer machine and per CI runner:

| Tool | Install command | Notes |
|------|----------------|-------|
| PowerShell 7+ | [aka.ms/powershell](https://aka.ms/powershell) | Required for PS module; PS 5 will not work |
| pac CLI | `dotnet tool install --global Microsoft.PowerApps.CLI.Tool` | Power Platform CLI |
| .NET SDK 6+ | [dotnet.microsoft.com](https://dotnet.microsoft.com/download) | Plugin build |
| Node.js (version from `.nvmrc`) | [nodejs.org](https://nodejs.org/) | Code App build |
| Python 3.11+ | [python.org](https://www.python.org/) | Deploy scripts |
| uv | `pip install uv` | Python package manager — use instead of bare pip |
| Pester v5 | `Install-Module Pester -MinimumVersion 5.0 -Force` | PS module tests |

### 5. Publisher and Solution Setup

Every customization belongs to a **publisher** with a **customization prefix**. This prefix is prepended to every table, column, option set, and Custom API name you create. See [naming-conventions.md](./naming-conventions.md) for the full naming reference.

```
Power Platform maker portal -> Solutions -> New solution
  Display name: <YourSolution> (PascalCase noun phrase)
  Name (unique): <PascalCaseIdentifier>
  Publisher: create or select existing
    Display name: <Publisher>
    Name: <publisher>
    Prefix: pub   (<- your customization prefix, 2-8 lowercase letters)
```

The customization prefix (`pub_`) appears in every logical name you author. Choose it once and never change it — renaming a prefix requires recreating all components.

### 6. Credential Files

**Local development:** store credentials in a gitignored `.env.<env>` file. The standard layout used by the deploy tooling:

```
ENVIRONMENT_URL=https://<org>.crm3.dynamics.com
CLIENT_ID=<service-principal-app-id>
CLIENT_SECRET=<service-principal-secret>
TENANT_ID=<aad-tenant-id>
ENVIRONMENT_ID=<power-platform-environment-guid>
APP_ID=<code-app-guid>              # only if project has a Code App
APP_DISPLAY_NAME=<code-app-name>    # only if project has a Code App
```

**CI/CD:** inject as environment secrets named `DATAVERSE_URL`, `DATAVERSE_CLIENT_ID`, `DATAVERSE_CLIENT_SECRET`, `DATAVERSE_TENANT_ID`. The deploy tooling detects these and skips `.env` file parsing entirely. Never commit `.env` files.

> **Worked example (this repo):** File is `apps/code-app/.env.dev`. The Python package's `load_env` module checks for `DATAVERSE_*` vars first; if all four are present it uses them and skips the file.

### 7. Profile File

A `deploy.profile.yaml` at the repo root holds project identity used by the deploy tooling:

```yaml
entity_prefix: pub          # customization prefix (without trailing _)
solution_name: MySolution   # Dataverse solution unique name
business_unit: my-app-bu   # BU name for role assignment
security_roles_file: seed/security_roles.yaml
tables:
  - pub_mytable
  - pub_anothertable
```

> **Worked example (this repo):** `entity_prefix: enmax_acdn`, `solution_name: EnmaxAutoCADNumbering`, `business_unit: enmax-autocad-app`.

### 8. pac CLI Authentication

Before any `pac solution` or `pac code` command, authenticate:

```powershell
pac auth create --name <env> --url <ENVIRONMENT_URL> `
  --applicationId <CLIENT_ID> --clientSecret <CLIENT_SECRET> --tenant <TENANT_ID>
pac auth who   # confirm active env before every state change
pac env select --environment <ENVIRONMENT_ID>
```

Run `pac auth who` before every state-changing pac operation. It is cheap and catches stale auth profiles early.
