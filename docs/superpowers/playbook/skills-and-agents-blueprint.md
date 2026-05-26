# Skills and Agents Blueprint

This file is the meta-layer that explains how to turn each playbook file into a composable **skill** and how to compose skills into **agents**. It also defines the installable **plugin** format that maps each playbook domain to the `microsoft/power-platform-skills` marketplace layout. As a skill itself, this would be loaded when designing an automation pipeline for Power Platform development.

For the agentic tool configuration (.claude/settings.json, MCP servers, hooks, slash commands) see [claude-code-copilot-setup.md](./claude-code-copilot-setup.md).

---

## What Is a Skill?

A skill is a scoped, self-contained prompt + context bundle that an agent loads for a specific task. Each playbook file in this directory is written to function as a skill payload: it has explicit prerequisites, step-by-step instructions, exact error codes, and clear success criteria.

A well-defined skill has:
- **Trigger description:** the condition that causes the agent to load this skill ("Use when ...")
- **Inputs:** what data/context the skill needs to run
- **Playbook section:** which file(s) it draws on
- **Preconditions:** what must be true before the skill starts
- **Success criteria:** how the agent knows the skill completed correctly

---

## Relationship to Microsoft power-platform-skills

The Microsoft `power-platform-skills` repository (https://github.com/microsoft/power-platform-skills) is a Claude Code / GitHub Copilot plugin marketplace for Power Platform development. This playbook mirrors and extends its format.

**Plugin layout (from the MS repo):**

```
plugins/<domain>/
  .claude-plugin/plugin.json   <- plugin manifest
  AGENTS.md                    <- cross-tool agent/persona instructions
  CLAUDE.md                    <- Claude Code-specific instructions
  README.md
  agents/<agent>.md            <- agent persona frontmatter + body
  skills/<skill-name>/
    SKILL.md                   <- skill frontmatter + workflow
    references/                <- supporting docs the skill loads
  shared/*.md                  <- shared prompts/patterns across skills
  references/*.md              <- domain-level reference docs
  samples/

.claude-plugin/marketplace.json  <- registers all plugins
```

**Domains in the MS repo:** `code-apps`, `canvas-apps`, `model-apps`, `mcp-apps`, `power-pages`.

**Where this playbook extends the MS repo:**
- Our `code-apps` domain adds the React+Fluent v9 high-polish/branded stack (FADE_UP, `makeStyles` longhand-only, `tokens.*` color tokens, hash router, MSW v2 test patterns).
- Our approach uses the **App Configuration table** instead of Dataverse environment variables in Code Apps — a hard platform constraint the MS repo does not fully document.
- We add the `dataverse`, `security`, `plugins-customapi`, `flows`, and `deploy` domains, which the MS repo does not cover.
- Our `plugins-customapi` domain includes concurrency-safe sequence issuance (Rule 14), the binding-type immutability gotcha, and entity-bound URL namespace prefix requirements.
- The `deploy` domain covers the full 8-step chain including the Python CLI, PowerShell module, PYTHONUTF8 gotcha, and async import.

---

## Proposed Marketplace Layout

```
plugins/
  code-apps/
    .claude-plugin/plugin.json
    AGENTS.md
    CLAUDE.md
    agents/
      code-app-architect.md
      code-app-developer.md
    skills/
      scaffold-code-app-screen/
        SKILL.md
        references/
          code-apps-reference.md   <- derived from code-apps.md
      diagnose-code-app-build/
        SKILL.md
    shared/
      fluent-v9-patterns.md
      hash-router-pattern.md
    references/
      app-config-table.md

  canvas-apps/
    .claude-plugin/plugin.json
    skills/
      author-canvas-screen/SKILL.md

  model-apps/
    .claude-plugin/plugin.json
    skills/
      configure-mda-form/SKILL.md
      configure-mda-sitemap/SKILL.md

  dataverse/
    .claude-plugin/plugin.json
    skills/
      provision-dataverse-schema/SKILL.md
      diagnose-dataverse-error/SKILL.md
    shared/
      web-api-gotchas.md
      skip-paging.md

  security/
    .claude-plugin/plugin.json
    skills/
      define-security-roles/SKILL.md
    shared/
      privilege-depth-strings.md

  plugins-customapi/
    .claude-plugin/plugin.json
    skills/
      register-custom-api/SKILL.md
      author-plugin-class/SKILL.md
    references/
      binding-type-immutability.md
      concurrency-safe-issuance.md

  flows/
    .claude-plugin/plugin.json
    skills/
      author-power-automate-flow/SKILL.md
    shared/
      flow-json-invariants.md
      multichannel-notification.md

  deploy/
    .claude-plugin/plugin.json
    skills/
      deploy-power-platform-solution/SKILL.md
    shared/
      pac-cli-commands.md
      credential-resolution.md

.claude-plugin/marketplace.json
```

---

## plugin.json Format

One `plugin.json` per domain under `plugins/<domain>/.claude-plugin/plugin.json`.

```json
{
  "name": "power-platform-flows",
  "version": "1.0.0",
  "description": "Skills and agents for authoring, testing, and deploying Power Automate cloud flows in a Dataverse solution.",
  "author": {
    "name": "Your Organization",
    "url": "https://github.com/yourorg/your-repo"
  },
  "homepage": "https://github.com/yourorg/your-repo/tree/specs/docs/superpowers/playbook",
  "repository": "https://github.com/yourorg/your-repo",
  "license": "MIT",
  "keywords": [
    "power-automate",
    "power-platform",
    "dataverse",
    "pac-cli",
    "claude-code"
  ]
}
```

### marketplace.json (top-level)

```json
{
  "plugins": [
    { "name": "code-apps",         "path": "plugins/code-apps" },
    { "name": "canvas-apps",       "path": "plugins/canvas-apps" },
    { "name": "model-apps",        "path": "plugins/model-apps" },
    { "name": "dataverse",         "path": "plugins/dataverse" },
    { "name": "security",          "path": "plugins/security" },
    { "name": "plugins-customapi", "path": "plugins/plugins-customapi" },
    { "name": "flows",             "path": "plugins/flows" },
    { "name": "deploy",            "path": "plugins/deploy" }
  ]
}
```

---

## Agent Format

Agent files live at `plugins/<domain>/agents/<agent>.md`. Frontmatter defines the persona; body provides guardrails and expertise.

### Example: `code-app-architect.md`

```markdown
---
name: code-app-architect
description: Architect for Power Apps Code Apps built with React, TypeScript, and Fluent UI v9.
  Use when: planning a new Code App, deciding app type, designing screen structure,
  reviewing data-fetching strategy, or validating tech stack choices.
---

You are a Power Apps Code App architect specializing in React 18, TypeScript strict mode,
Fluent UI v9, TanStack Query v5, and hash-router-based SPAs deployed into Power Apps.

## Core guardrails

- Code Apps cannot read Dataverse environment variables. Always recommend the App Configuration
  table (pub_appconfig) for any config the app needs to read at runtime.
- Use createHashRouter (not createBrowserRouter) — the app is served from a CDN URL with a
  path prefix that breaks browser-history routing.
- All colors must use Fluent UI design tokens. No hardcoded hex or named colors.
- makeStyles calls must use longhand CSS properties only — Griffel does not support shorthands.
- Use npx tsc -b (not tsc --noEmit) for type-checking — the root tsconfig uses files:[] +
  project references, making tsc --noEmit a no-op.
- Sequential number issuance must go through the Custom API + synchronous plugin (Rule 14).

## Expertise

- When to choose Code App vs Model-Driven App vs Canvas App (see decision guide in
  model-driven-and-canvas-apps.md).
- Hash-router screen registration under createHashRouter.
- Role resolution via getContext() + systemuser query + team membership query.
- Server-paging pattern: maxPageSize + skipToken (not $skip).
- MSW v2 handler patterns for Dataverse entity sets and Custom APIs.
- Test isolation: render dialogs directly with open={true} rather than navigating overlays.
```

### Example: `flow-author.md` (flows domain)

```markdown
---
name: flow-author
description: Authors and edits Power Automate cloud flow JSON under solution/src/Workflows/.
  Use when: adding or modifying a cloud flow, adding actions, fixing runAfter references,
  updating env var references, or building a multi-channel notification flow.
tools: Read, Edit, Write, Glob, Grep
---

You author and edit Power Automate flow JSON. You do not run imports.

Rules:
- Edit only files under solution/src/Workflows/.
- Action keys cannot contain spaces — use underscores.
- Renaming an action key: update every runAfter reference and outputs()/body() expression.
- Env vars: @{parameters('pub_MyVar')} — not Power Fx syntax, not hardcoded values.
- Every connector action must have a matching top-level connectionReferences key.
- Never delete $connections or $authentication from definition.parameters.
- runAfter: {} means "run after trigger".
- Flows are not transactional. Synchronous validation goes in a plugin, not a flow.
```

---

## SKILL.md Format

Skill files live at `plugins/<domain>/skills/<skill>/SKILL.md`. The frontmatter drives Claude Code's skill routing.

```markdown
---
name: author-power-automate-flow
description: Authors and deploys a solution-aware Power Automate cloud flow.
  Use when: a plan adds a new notification flow, integration flow, scheduled job,
  or approval flow. Also use when diagnosing a flow that fails after import.
user-invocable: true
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(pac *), Bash(jq *)
model: sonnet
---

## References

- ${CLAUDE_PLUGIN_ROOT}/shared/flow-json-invariants.md
- ${CLAUDE_PLUGIN_ROOT}/shared/multichannel-notification.md
- ./references/power-automate-flows-reference.md

## Workflow

1. Read the spec to identify trigger type, connected tables, output channels, and env vars needed.
2. If a new connection reference is needed: ask the developer to create a stub flow in the
   maker portal, then run pac solution sync to pull it into src/.
3. Edit solution/src/Workflows/<FlowName>-<GUID>.json:
   - Use underscores in action keys (no spaces).
   - Set runAfter for every action.
   - Reference env vars as @{parameters('pub_MyVar')}.
   - Keep $connections and $authentication in definition.parameters.
4. Add a <Workflow> entry to solution/src/Other/Customizations.xml.
5. Run: pac solution check --path solution/src --geo UnitedStates
6. Run: pac solution pack --folder solution/src --zipfile out/Solution.zip
7. Run: pac solution import --path out/Solution.zip --settings-file settings/dev.settings.json
        --activate-plugins --publish-changes --async --max-async-wait-time 60
8. Trigger the flow and query flowruns for status=Succeeded.
9. Commit flow JSON, Customizations.xml, and settings files.

## Success criteria
- pac solution check passes with no errors.
- pac solution import exits 0.
- flowruns table shows status=Succeeded within 60 seconds of triggering.
```

---

## Skill Catalog

### 1. `provision-dataverse-schema`

**Trigger:** a spec or plan adds a new table, column, option set, or relationship.

**Inputs:**
- Table definitions (logical name, display name, ownership type, columns)
- Option set definitions (name, values including 0=None)
- Relationship definitions (schema, referencing/referenced entities, cascade)
- Alternate key definitions (table, columns)

**Playbook:** [dataverse-foundation.md](./dataverse-foundation.md), [naming-conventions.md](./naming-conventions.md)

**Preconditions:**
- Auth configured (`DATAVERSE_*` env vars or `.env.dev` present)
- Solution exists and solution name is set in `deploy.profile.yaml`
- No existing table with the same logical name (or idempotency check passes)

**Steps:**
1. Load naming conventions — verify prefix matches `deploy.profile.yaml`.
2. Check existence of each option set -> create missing ones (include 0=None).
3. Check existence of each table -> create table with all columns, or add missing columns to existing table.
4. Check existence of each relationship -> create missing ones.
5. Check existence of each alternate key -> create missing ones.
6. Run `pp-deploy schema --environment <env>`.

**Success criteria:**
- `GET /api/data/v9.2/EntityDefinitions(LogicalName='<table>')` returns 200 for every new table.
- `GET /api/data/v9.2/GlobalOptionSetDefinitions(Name='<name>')` returns 200 for every new option set.
- Script exits 0.

**SKILL.md frontmatter:**
```yaml
name: provision-dataverse-schema
description: Provisions Dataverse tables, columns, option sets, relationships, and alternate
  keys. Use when a spec adds new schema, when a column is missing from an existing table,
  or when an option set needs a new value.
user-invocable: true
allowed-tools: Read, Edit, Bash(python -m powerplatform_deploy.cli *), Bash(curl --fail -sS *)
model: sonnet
```

**References:** [dataverse-foundation.md](./dataverse-foundation.md), [naming-conventions.md](./naming-conventions.md)

---

### 2. `define-security-roles`

**Trigger:** a new persona or permission requirement is added to a spec.

**Inputs:**
- Role name and description
- Privilege matrix (table x operation x depth)
- Business unit name

**Playbook:** [security-roles-bu-teams.md](./security-roles-bu-teams.md), [naming-conventions.md](./naming-conventions.md)

**Preconditions:**
- Schema provisioned (tables must exist for privilege IDs to resolve)
- BU name defined in `deploy.profile.yaml`

**Steps:**
1. Add/update role definition in `solution/seed/security_roles.yaml`.
2. Run `pp-deploy roles --environment dev --dry-run` to validate.
3. Run `pp-deploy roles --environment dev` to apply.
4. Verify via `GET /api/data/v9.2/roles?$filter=name eq '<name>'`.

**Success criteria:**
- Role record exists with the correct BU binding.
- `ReplacePrivilegesRole` call succeeds (no missing privilege warnings for tables that exist).

**SKILL.md frontmatter:**
```yaml
name: define-security-roles
description: Defines and provisions Dataverse security roles with privilege matrices.
  Use when a spec adds a new user persona, when privilege requirements change, or when
  a new table needs role access defined.
user-invocable: true
allowed-tools: Read, Edit, Bash(python -m powerplatform_deploy.cli *)
model: sonnet
```

---

### 3. `register-custom-api`

**Trigger:** a plan adds a new Custom API (with or without a new plugin class).

**Inputs:**
- Custom API unique name, display name, binding type (0/1/2)
- Bound entity logical name (for binding type 1)
- Request parameters (name, type code, optional flag)
- Response properties (name, type code)
- Plugin class name

**Playbook:** [plugins-and-custom-apis.md](./plugins-and-custom-apis.md), [naming-conventions.md](./naming-conventions.md)

**Preconditions:**
- Plugin assembly pre-registered via PRT (first time only)
- Plugin class compiled and tested
- Binding type decided — cannot be changed after creation

**Steps:**
1. Add the Custom API definition to `PluginDefinitions.psd1`.
2. Build the plugin: `dotnet build solution/plugins/<Assembly> -c Release`.
3. Run `Register-PpPlugins -Environment dev`.
4. Verify: call the Custom API via the Web API and confirm the expected response.
5. For entity-bound APIs: verify the URL includes `Microsoft.Dynamics.CRM.` prefix.

**Success criteria:**
- `GET /api/data/v9.2/customapis?$filter=uniquename eq '<name>'` returns the API record.
- Test call returns the expected response properties without 404 or `0x80060888`.

**SKILL.md frontmatter:**
```yaml
name: register-custom-api
description: Registers a Dataverse Custom API and its backing plugin.
  Use when a spec adds a new Custom API action, when a plugin class is renamed,
  or when binding type or parameters need to change (requires delete + recreate).
user-invocable: true
allowed-tools: Read, Edit, Bash(dotnet build *), Bash(dotnet test *), Bash(pac *)
model: sonnet
```

---

### 4. `scaffold-code-app-screen`

**Trigger:** a plan adds a new page/feature to the Code App.

**Inputs:**
- Screen name and purpose
- Tables/queries the screen reads
- Actions the screen triggers (Custom APIs or mutations)
- Role/permission requirements

**Playbook:** [code-apps.md](./code-apps.md), [naming-conventions.md](./naming-conventions.md)

**Preconditions:**
- Tables used by the screen exist in Dataverse and in `power.config.json` dataSources
- App Configuration table has any required feature flag rows
- Auth and role resolution working

**Steps:**
1. Create `src/features/<feature>/<FeatureName>Page.tsx` with page skeleton (FADE_UP, branded header, gap container).
2. Create React Query hooks in `use<FeatureName>.ts`.
3. Add route to `src/router.tsx`.
4. Add table entries to `power.config.json` dataSources if not present.
5. Add MSW handlers in `src/mocks/handlers.ts`.
6. Write tests (render directly, `findBy*` for async, no nested overlay navigation).
7. Run `npx tsc -b` (not `tsc --noEmit`), `npm test -- --run`, `npm run build`.
8. Push: `Publish-PpCodeApp -Environment dev`.
9. Smoke test in browser.

**Success criteria:**
- `npx tsc -b` exits 0.
- `npm test -- --run` passes all tests.
- `npm run build` succeeds.
- Screen renders correctly in the live app with correct data and role-gated actions.

**SKILL.md frontmatter:**
```yaml
name: scaffold-code-app-screen
description: Scaffolds a new screen (page + hooks + tests) in a Power Apps Code App.
  Use when a plan adds a new feature page, admin surface, or data grid screen.
  Also use when adding tabs to an existing page or new columns to a data grid.
user-invocable: true
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(npm run *), Bash(npm test *), Bash(npx tsc *)
model: sonnet
```

---

### 5. `author-power-automate-flow`

**Trigger:** a plan adds a new notification, automation, or integration flow.

**Inputs:**
- Trigger type (Dataverse CUD, scheduled, HTTP)
- Connected tables and actions
- Output channels (email, Teams, in-app notification)
- Environment variables or connection references needed

**Playbook:** [power-automate-flows.md](./power-automate-flows.md), [naming-conventions.md](./naming-conventions.md)

**Preconditions:**
- Connection references defined and seeded in maker portal (if new connector)
- Deployment settings files created for each environment
- pac CLI authenticated

**Steps:**
1. Create stub flow in maker portal to generate the connection reference scaffold.
2. Run `pac solution sync`.
3. Edit flow JSON: add actions, `runAfter`, env var references, error scopes.
4. Run `pac solution check`.
5. Pack and import.
6. Trigger the flow and verify via `flowruns`.
7. Add `<Workflow>` entry to `Customizations.xml`.
8. Commit flow JSON, Customizations.xml, and settings files.

**Success criteria:**
- `pac solution check` passes.
- `flowruns` shows `status=Succeeded` within 60 seconds.
- Output artifacts (notifications, emails, Teams messages, DB rows) appear as expected.

**SKILL.md frontmatter:**
```yaml
name: author-power-automate-flow
description: Authors and deploys a solution-aware Power Automate cloud flow.
  Use when a plan adds a notification flow, integration, scheduled job, or approval flow.
  Also use when diagnosing a flow that imports disabled or fails at runtime.
user-invocable: true
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(pac *), Bash(jq *)
model: sonnet
```

---

### 6. `deploy-power-platform-solution`

**Trigger:** feature branch is ready to push to a target environment.

**Inputs:**
- Target environment name (dev/uat/prod)
- Whether this is a first import or upgrade

**Playbook:** [deployment-and-cicd.md](./deployment-and-cicd.md)

**Preconditions:**
- Credentials in place (`DATAVERSE_*` env vars or `.env.<env>`)
- `deploy.profile.yaml` current
- All tests passing locally
- `pac solution check` passes

**Steps:**
1. `Connect-PpDataverse -Environment <env>`
2. `pp-deploy pack --environment <env>`
3. `pp-deploy import --environment <env>` (add `--stage-and-upgrade` for managed upgrades)
4. `Register-PpPlugins -Environment <env>`
5. `pp-deploy optionsets --environment <env>`
6. `pp-deploy seed --environment <env>`
7. `pp-deploy roles --environment <env>`
8. `Publish-PpCodeApp -Environment <env>`
9. Smoke test in browser.

**Success criteria:**
- All 8 steps exit 0.
- App loads in browser.
- Key features smoke-tested end-to-end.

**SKILL.md frontmatter:**
```yaml
name: deploy-power-platform-solution
description: Runs the full 8-step Power Platform deploy chain to a target environment.
  Use when a feature branch is ready to deploy to dev, uat, or prod.
  Also use to re-run a failed deploy from the failing step.
user-invocable: true
allowed-tools: Read, Bash(pac *), Bash(python -m powerplatform_deploy.cli *), Bash(dotnet *)
model: sonnet
```

---

### 7. `diagnose-dataverse-error`

**Trigger:** a Dataverse Web API call returns an unexpected error code or status.

**Inputs:**
- HTTP status code
- Error code (e.g. `0x80060888`)
- Error message text
- The request that triggered it

**Playbook:** [dataverse-foundation.md](./dataverse-foundation.md), [plugins-and-custom-apis.md](./plugins-and-custom-apis.md)

**Common error codes:**

| Code | Meaning | Fix |
|------|---------|-----|
| `0x80060888` | Skip clause not supported / Resource not found | For $skip: use skipToken paging. For resource not found: verify entity-bound URL includes `Microsoft.Dynamics.CRM.` prefix |
| `404` | Entity set name wrong / wrong URL format | Verify entity set name via metadata; check binding type |
| `400` | Invalid property / malformed body | Check column names; check `@odata.bind` format |
| `401` | Auth token expired or wrong resource | Re-acquire token with `<env-url>/.default` scope |
| `409` | Duplicate alternate key | Record already exists; switch to PATCH upsert |
| `429` | Rate limited | Respect `Retry-After` header; add exponential backoff |

**SKILL.md frontmatter:**
```yaml
name: diagnose-dataverse-error
description: Diagnoses and fixes Dataverse Web API errors.
  Use when a pac command, deploy script, or Code App API call returns an unexpected
  HTTP status code, OData error code, or plugin fault.
user-invocable: true
allowed-tools: Read, Bash(curl --fail -sS *), Bash(pac *)
model: opus
```

---

## Per-Domain Subagents, Hooks, and Slash Commands

| Domain | Subagents | Hooks | Slash commands |
|--------|-----------|-------|----------------|
| `flows` | `flow-author`, `flow-validator`, `deployer` | PostToolUse: jq empty on Workflows/*.json edit; PreToolUse: pac auth who before import | `/validate`, `/pack-and-import <env>`, `/flow-runs <name>` |
| `code-apps` | `code-app-architect`, `code-app-developer` | PostToolUse: `npx tsc -b` after tsx edit | `/typecheck`, `/push-code-app <env>` |
| `dataverse` | (inline; use flow-validator for read-only checks) | — | `/check-table <logicalname>`, `/check-optionset <name>` |
| `plugins-customapi` | (inline) | PreToolUse: warn before `Register-PpPlugins` if binding type differs | `/register-plugins <env>` |
| `deploy` | `deployer` | SessionStart: print `pac auth who`; PreToolUse: assert settings file matches active env | `/deploy <env>`, `/deploy-dry-run <env>` |
| `security` | (inline) | — | `/provision-roles <env>` |

Each subagent and slash command is detailed in [claude-code-copilot-setup.md](./claude-code-copilot-setup.md).

---

## Orchestrator Agents

An orchestrator agent sequences multiple skills to complete a high-level goal.

### "Power Platform Feature Builder" Agent

Sequences schema -> security -> plugin/API -> app -> flow -> deploy for a complete feature.

```
Input: feature spec (tables, Custom APIs, UI screens, flows, roles)

1. provision-dataverse-schema
   | (tables exist)
2. define-security-roles
   | (roles exist)
3. register-custom-api        (if spec includes Custom APIs/plugins)
   | (Custom APIs registered)
4. scaffold-code-app-screen   (if spec includes Code App screens)
   |
   +-- [parallel if independent]
5. author-power-automate-flow (if spec includes flows)
   | (code + flow complete)
6. deploy-power-platform-solution -Environment dev
   | (dev deploy verified)
7. deploy-power-platform-solution -Environment uat
```

### "Diagnose and Fix" Agent

For errors encountered during development or deployment:

```
Input: error code + message + context

1. diagnose-dataverse-error
   | (root cause identified)
2. [select fix skill based on root cause]
   -> provision-dataverse-schema     (if table/column missing)
   -> register-custom-api            (if binding type wrong -> delete + recreate)
   -> deploy-power-platform-solution (if re-deploy needed)
   -> scaffold-code-app-screen       (if code-side fix needed)
```

---

## Skill Dependency Graph

```
naming-conventions
        |
        |---> provision-dataverse-schema
        |           |
        |           |---> define-security-roles
        |           |           |
        |           |           `---> deploy-power-platform-solution
        |           |                       ^
        |           |---> register-custom-api
        |           |           |
        |           |           |---> scaffold-code-app-screen ---------|
        |           |           |                                        |
        |           |           `---> author-power-automate-flow --------|
        |           |                                                    |
        |           `----------------------------------------------------+
        |
        `---> diagnose-dataverse-error (reads all skills for error context)
```

**Key ordering constraints:**
- Schema must exist before roles (privileges reference table metadata)
- Schema must exist before Custom APIs (bound entities must exist)
- Custom APIs must be registered before Code App screens that call them
- All of the above must be deployed before the Code App (App Configuration rows, tables)
- `pac solution check` must pass before `pac solution import` (enforced in hooks)

---

## Implementation Notes for Skill Authoring

When turning a playbook section into an executable skill prompt:

1. **Be explicit about file paths.** Don't say "edit the config file" — say "edit `apps/code-app/power.config.json`".

2. **Include exact verification commands.** Every step that modifies state should be followed by a read-side verification (e.g. `GET /api/data/v9.2/EntityDefinitions(LogicalName='...')`).

3. **Encode success criteria as test conditions**, not prose. "API returns 200" is testable; "should work" is not.

4. **Surface conflicts immediately.** If the spec says to create a Custom API with `bindingtype=1` but there's an existing record with `bindingtype=0` — stop, report, do not try to PATCH it (binding type is immutable).

5. **One skill per concern.** Do not combine "scaffold screen" with "deploy" — they have different failure modes and recovery paths.

6. **Scope `allowed-tools` tightly.** A read-only validator subagent should not have `Write` or `Bash(pac solution import *)` in its tool list.

7. **Use `model: opus` only when reasoning depth justifies it.** Most skills work well with `sonnet`. Use `opus` for diagnosis skills that must reason across many error codes and interacting systems.
