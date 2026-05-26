# Claude Code and GitHub Copilot Setup for Power Platform

This file is the bridge between the playbook content and agentic delivery. It explains how to configure Claude Code and GitHub Copilot to drive Power Platform builds reliably: which MCP servers reduce hallucination, how to scope tool permissions, how to structure subagents, and how to write hooks and slash commands.

For repo layout see [repo-setup.md](./repo-setup.md). For the skills/agents format see [skills-and-agents-blueprint.md](./skills-and-agents-blueprint.md).

---

## Why Configure the Agent Tooling

Left unconfigured, an agent working on Power Platform will:

- Guess `pac` syntax instead of querying the real CLI docs, producing flags that do not exist.
- Run `pac solution delete` or `pac auth clear` by accident during diagnosis.
- Deploy to prod when it meant dev because the active auth profile was wrong.
- Hallucinate Dataverse API paths that differ from the actual OData endpoint behavior.

The configuration below prevents each of these failure modes.

---

## MCP Servers

MCP (Model Context Protocol) servers extend the agent with live tools. Register them once per project.

### 1. Power Platform CLI built-in MCP (`pac-mcp`)

The pac CLI ships an MCP server that exposes the full CLI surface as structured tools. When registered, the agent calls `pac` through the MCP rather than constructing shell commands from memory.

```bash
# Register (run once; persists in ~/.claude/mcp.json or project settings)
claude mcp add pac-mcp -- dnx Microsoft.PowerApps.CLI.Tool --yes copilot mcp --run
```

Per Microsoft Learn ("Use Power Platform CLI with built-in MCP server"): "This server lets you interact with Power Platform in natural language using MCP-compatible tools. It isn't necessary to memorize all the PAC CLI commands and parameters or constantly refer to documentation."

**Why it reduces hallucination:** the MCP server provides the exact flag names and parameter shapes for the installed CLI version. The agent cannot confuse `--activate-plugins` with `--enable-flows` because it uses the structured tool, not a memorized string.

### 2. Microsoft Learn MCP (`mslearn`)

Provides on-demand fetch of official Microsoft documentation pages. When the agent needs to verify a Dataverse OData behavior or a pac CLI flag, it fetches from the authoritative source rather than relying on training data.

```bash
claude mcp add mslearn -t http https://learn.microsoft.com/api/mcp
```

Use this when:
- Verifying a pac CLI flag (training data may lag behind releases).
- Looking up Dataverse Web API behavior (OData filters, entity set names, privilege depth enum names).
- Checking Power Automate connector schemas or flow action types.

### 3. Dataverse MCP (optional, recommended for development sessions)

Allows the agent to query solution components, flow run history, entity metadata, and environment variables directly from Dataverse without writing Bash calls.

```bash
claude mcp add dataverse -t stdio -- \
  npx -y @microsoft/dataverse mcp https://<yourorg>.crm.dynamics.com
```

Use this when:
- Checking whether a Custom API or table already exists before creating it.
- Reading `flowruns` to diagnose a failed flow without leaving the agent session.
- Verifying privilege IDs or connection reference logical names.

> TODO: verify the exact package name `@microsoft/dataverse` — check the npm registry or Microsoft Learn for the official Dataverse MCP package.

---

## `.claude/settings.json` — Permissions and Hooks

Place this file at the repo root under `.claude/settings.json`. It is committed to source control (without secrets — secrets are injected as environment variables).

### Full example

```json
{
  "permissions": {
    "allow": [
      "Bash(pac *)",
      "Bash(dotnet build *)",
      "Bash(dotnet test *)",
      "Bash(dotnet run *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git push *)",
      "Bash(git log *)",
      "Bash(git worktree *)",
      "Bash(jq *)",
      "Bash(curl --fail -sS *)",
      "Bash(npm run *)",
      "Bash(npm test *)",
      "Bash(npx tsc *)",
      "Bash(python -m powerplatform_deploy.cli *)",
      "Bash(python -m pytest *)",
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep"
    ],
    "deny": [
      "Bash(pac auth clear *)",
      "Bash(pac solution delete *)",
      "Bash(pac env delete *)",
      "Bash(rm -rf *)",
      "Bash(git push --force *)",
      "Bash(git reset --hard *)"
    ]
  },
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "pac auth who && pac org who"
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash(pac solution import *)",
        "type": "command",
        "command": "pac auth who"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit(solution/src/Workflows/*.json)",
        "type": "command",
        "command": "jq empty \"$CLAUDE_TOOL_ARG_FILE_PATH\""
      }
    ]
  }
}
```

### Allow list rationale

| Pattern | Rationale |
|---------|-----------|
| `Bash(pac *)` | Full pac CLI access for solution lifecycle and auth |
| `Bash(dotnet *)` | Plugin build and test |
| `Bash(git *)` (scoped) | Source control operations; push --force and reset --hard are explicitly denied |
| `Bash(jq *)` | JSON validation of flow files |
| `Bash(curl --fail -sS *)` | Direct Dataverse Web API calls when the pac MCP is unavailable |
| `Bash(npm run *)`, `Bash(npx tsc *)` | Code App build and type-check |
| `Bash(python -m powerplatform_deploy.cli *)` | Deploy package CLI |

### Deny list rationale

| Pattern | Why denied |
|---------|-----------|
| `pac auth clear *` | Wiping auth profiles breaks every subsequent pac command; requires human reset |
| `pac solution delete *` | Irreversible; requires explicit human authorization |
| `rm -rf *` | Unconditional recursive delete; surgical removes are fine, this pattern is not |
| `git push --force *` | Force-push to shared branches destroys history |
| `git reset --hard *` | Discards uncommitted changes without recovery |

---

## Hooks

### SessionStart: confirm active auth profile

At the start of every Claude Code session, print the active pac auth profile and org so the agent always knows which environment it is pointed at.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "pac auth who && pac org who"
      }
    ]
  }
}
```

**Effect:** the agent opens every session with a printed line like `Environment: https://contoso-dev.crm.dynamics.com | User: SPN-deploy-dev`. If the wrong environment is active, the developer catches it before any state-changing command runs.

### PreToolUse: gate solution import

Before every `pac solution import`, assert that the active auth profile matches the settings file being used:

```bash
#!/usr/bin/env bash
# .claude/hooks/assert-auth-env.sh
# Called before pac solution import; $1 = full command string
ACTIVE_ENV=$(pac auth who --json | jq -r '.environmentUrl')
if [[ "$1" == *"dev.settings.json"* && "$ACTIVE_ENV" != *"-dev"* ]]; then
  echo "ERROR: Active env is $ACTIVE_ENV but settings file is dev.settings.json"
  exit 1
fi
```

This prevents deploying dev settings to the uat environment because the agent forgot to switch auth profiles.

### PostToolUse: validate flow JSON after edits

After every edit to a flow JSON file, run `jq empty` to catch syntax errors before the next pack attempt:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit(solution/src/Workflows/*.json)",
        "type": "command",
        "command": "jq empty \"$CLAUDE_TOOL_ARG_FILE_PATH\" && echo 'JSON valid'"
      }
    ]
  }
}
```

A more thorough hook also validates against the Logic Apps schema URL and checks that every `runAfter` key resolves to an existing action key in the same file.

---

## Subagents

Subagents are focused persona files placed in `.claude/agents/`. Each covers one narrow responsibility with a scoped tool list. Keep them under 30 lines of instruction.

### `flow-author.md` — edits flow JSON

```markdown
---
name: flow-author
description: Authors and edits Power Automate flow JSON under solution/src/Workflows/.
  Use when: adding or modifying a cloud flow definition, adding actions, fixing runAfter
  references, or updating env var references.
tools: Read, Edit, Write, Glob, Grep
---

You author and edit Power Automate flow JSON.

Rules:
- Edit only files under solution/src/Workflows/.
- Action keys are identifiers: no spaces, use underscores (Get_item not Get item).
- When renaming an action key, update every runAfter reference and every outputs()/body() reference globally.
- Reference environment variables as @{parameters('pub_MyVar')} — not Power Fx syntax.
- Every connector action must have a matching top-level connectionReferences entry.
- The schema URL is https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#.
- Never delete $connections or $authentication from definition.parameters.
- runAfter: {} means "run after trigger"; it is not an error.
```

### `flow-validator.md` — read-only checks

```markdown
---
name: flow-validator
description: Validates flow JSON and solution packages. Read-only.
  Use when: verifying flow JSON before import, running pac solution check,
  checking runAfter consistency, or diagnosing a pac solution check failure.
tools: Read, Bash(pac solution check *), Bash(jq *)
---

You validate flow JSON and solution packages. You do not modify files.

Validation sequence:
1. jq empty on each Workflows/*.json to check syntax.
2. Verify every runAfter key resolves to an existing action key in the same file.
3. Verify every host.connectionName matches a top-level connectionReferences key.
4. Run pac solution check --path solution/src --geo UnitedStates.
5. Report all failures clearly with file + line references.
```

### `deployer.md` — pack and import

```markdown
---
name: deployer
description: Packs and imports Power Platform solutions. Requires explicit environment argument.
  Use when: deploying a solution to dev, uat, or prod after validation passes.
tools: Bash(pac solution pack *), Bash(pac solution import *), Bash(pac auth who), Read
---

You pack and import Power Platform solutions.

Rules:
- Always run pac auth who first and print the active environment.
- Always require an explicit --settings-file argument matching the target environment.
- For first-time imports: use pac solution import without --stage-and-upgrade.
- For upgrades to uat/prod: use --stage-and-upgrade.
- Always pass --activate-plugins --async --max-async-wait-time 60.
- Never deploy to uat or prod without explicit human confirmation in the conversation.
```

### Tool scoping principle

Each subagent's `tools` list is the minimum required for its task. The validator cannot write files. The deployer cannot edit JSON. The flow-author cannot run imports. This prevents cross-concern accidents.

---

## Slash Commands

Slash commands are scripts placed in `.claude/commands/`. They appear in Claude Code's command palette and in GitHub Copilot's slash-command surface.

### `/validate`

```bash
#!/usr/bin/env bash
# .claude/commands/validate
# Runs full pre-import validation: JSON syntax + runAfter check + pac solution check

set -euo pipefail

echo "=== Validating flow JSON syntax ==="
for f in solution/src/Workflows/*.json; do
  jq empty "$f" && echo "OK: $f"
done

echo "=== Running pac solution check ==="
pac solution check --path solution/src --geo UnitedStates

echo "=== Validation complete ==="
```

### `/pack-and-import <env>`

```bash
#!/usr/bin/env bash
# .claude/commands/pack-and-import
# Usage: /pack-and-import dev

ENV=${1:-dev}
SETTINGS="settings/${ENV}.settings.json"

pac auth who

pac solution pack \
  --folder solution/src \
  --zipfile out/Solution.zip \
  --packagetype Unmanaged

pac solution import \
  --path out/Solution.zip \
  --settings-file "$SETTINGS" \
  --publish-changes \
  --activate-plugins \
  --async \
  --max-async-wait-time 60
```

### `/flow-runs <flowname>`

```bash
#!/usr/bin/env bash
# .claude/commands/flow-runs
# Usage: /flow-runs "My Flow Display Name"
# Queries the Dataverse flowruns elastic table for recent runs of the named flow.

FLOW_NAME="$1"
# Acquire a Dataverse token via OAuth2 client-credentials (service principal).
# This is the portable approach the deploy tooling uses (no reliance on a pac
# token subcommand); DATAVERSE_* come from .env.<env> or CI secrets.
ENV_URL="${DATAVERSE_URL%/}"
TOKEN=$(curl --fail -sS \
  -d "grant_type=client_credentials" \
  -d "client_id=${DATAVERSE_CLIENT_ID}" \
  -d "client_secret=${DATAVERSE_CLIENT_SECRET}" \
  -d "scope=${ENV_URL}/.default" \
  "https://login.microsoftonline.com/${DATAVERSE_TENANT_ID}/oauth2/v2.0/token" \
  | jq -r '.access_token')

# Get workflow ID from display name
WORKFLOW_ID=$(curl --fail -sS \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json" \
  "${ENV_URL}/api/data/v9.2/workflows?\$filter=name eq '${FLOW_NAME}'&\$select=workflowid" \
  | jq -r '.value[0].workflowid')

# Query flow runs
curl --fail -sS \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json" \
  "${ENV_URL}/api/data/v9.2/flowruns?\$filter=resourceid eq '${WORKFLOW_ID}'&\$select=name,status,starttime,endtime,errorcode,errormessage&\$orderby=starttime desc&\$top=10" \
  | jq '.value[] | {status, starttime, errormessage}'
```

---

## GitHub Copilot Equivalents

GitHub Copilot (in VS Code, Visual Studio, and GitHub.com) uses a similar but distinct configuration surface. The same skills and agents port across both tools.

### `AGENTS.md` — the cross-tool instruction file

`AGENTS.md` at the repo root is the Copilot equivalent of `CLAUDE.md`. It is also read by the Microsoft `power-platform-skills` plugin format. Place a concise operating contract here:

```markdown
# AGENTS.md

## Operating contract for all AI agents in this repo

1. Never edit .zip files — always edit under solution/src/.
2. Run pac auth who before every state-changing pac command.
3. Run pac solution check before pac solution import.
4. Treat deploy.profile.yaml and settings/*.settings.json as code; changes need review.
5. Code Apps cannot read environment variables — use the pub_appconfig table.
6. Sequential number issuance must go through the Custom API + synchronous plugin (Rule 14).
```

### Copilot custom instructions

In VS Code, `.github/copilot-instructions.md` provides per-repo Copilot context. Mirror the key rules from `CLAUDE.md` and `AGENTS.md` here. Copilot reads this file during chat interactions.

### Skills and agents map to Copilot

The skill format in [skills-and-agents-blueprint.md](./skills-and-agents-blueprint.md) mirrors the `microsoft/power-platform-skills` plugin layout. A skill defined as a `SKILL.md` file with frontmatter (`name`, `description`, `allowed-tools`, `model`) is compatible with both Claude Code (via plugin loading) and GitHub Copilot (via Copilot Extensions and the skills marketplace).

The slash commands defined above (`/validate`, `/pack-and-import`, `/flow-runs`) map to Copilot slash commands when packaged as a Copilot Extension or as commands in a `copilot-extensions/` directory.

---

## Operating Rules for Agents in This Repo

These rules are stated explicitly so agents can be evaluated against them:

1. Never edit a `.zip` file. Always edit under `solution/src/`, then pack, then import.
2. Never run `pac auth clear` or `pac solution delete` without explicit human authorization.
3. Always run `pac solution check` before `pac solution import`. If it fails, fix before proceeding.
4. Always confirm the active auth profile (`pac auth who`) before any state-changing command.
5. Treat `settings/*.settings.json` and `deploy.profile.yaml` as code — changes are PRs.
6. When uncertain about pac syntax, query the `pac-mcp` or `mslearn` MCP servers, not memory.
7. After every flow change: `pac solution check` clean -> import green -> FlowRun Succeeded within 60 seconds.
8. Code Apps cannot read Dataverse environment variables. Use the `pub_appconfig` table (Rule 15).
9. Sequential number/ID issuance must go through the Custom API + synchronous plugin (Rule 14).
10. `tsc --noEmit` is a no-op for the Code App's project-references tsconfig — always use `npx tsc -b`.
