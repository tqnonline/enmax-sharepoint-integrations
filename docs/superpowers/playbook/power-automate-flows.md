# Power Automate Flows

This file covers solution-aware Power Automate cloud flows: the `src/` source-of-truth discipline, JSON anatomy and invariants, pac CLI operations, connection references, environment variables, deployment settings, round-tripping, testing, and the multi-channel notification pattern. As a skill, this would be loaded when an agent needs to author, register, test, or diagnose a flow.

For naming conventions see [naming-conventions.md](./naming-conventions.md). For connection references and environment variables background see [model-driven-and-canvas-apps.md](./model-driven-and-canvas-apps.md). For deployment see [deployment-and-cicd.md](./deployment-and-cicd.md). For the agent/agentic configuration see [claude-code-copilot-setup.md](./claude-code-copilot-setup.md).

---

## Operating Contract: `src/` Is the Source of Truth

**Never edit the solution `.zip` file.** The `.zip` is a build artifact produced by `pac solution pack`. Editing it directly corrupts metadata that pac manages, and the next `pack` or `sync` will overwrite your changes.

The authoritative sources are:

```
solution/src/Workflows/<FlowDisplayName>-<UPPERCASEGUID>.json   <- flow definition
solution/src/Other/Customizations.xml                           <- Workflow registrations
solution/src/EnvironmentVariableDefinitions/                     <- env var definitions
solution/src/ConnectionReferences/                              <- connection ref XML
settings/<env>.settings.json                                    <- env-specific bindings
```

When something must be done in the maker portal (e.g., seeding a new flow with a new connection reference), pull it back immediately with `pac solution sync` and commit. After that, all edits happen as JSON under `src/`.

---

## Source Layout

```
solution/
  src/
    Workflows/
      <FlowDisplayName>-<UPPERCASEGUID>.json   <- flow definition (one per flow)
    Other/
      Customizations.xml                       <- flow registration entries
    EnvironmentVariableDefinitions/
      pub_MyVar/
        environmentvariabledefinition.xml      <- type, schema name, default value
        environmentvariablevalues.json         <- current value (env-specific; see below)
    ConnectionReferences/
      pub_sharedconn_XXXX.xml                  <- connection ref definitions
```

Flow files are named `<FlowDisplayName>-<UPPERCASE-GUID>.json`. The GUID is the `WorkflowId` (hyphenated, no braces, uppercased). This naming is confirmed by Microsoft Learn ("Export a solution-aware cloud flow"): "Find the flows in the Workflows folder in the solution zip file. Each exported workflow is represented as a JSON file."

---

## pac CLI Commands

### Authentication (before every state-changing command)

```powershell
pac auth create `
  --name dev `
  --url <ENVIRONMENT_URL> `
  --applicationId <CLIENT_ID> `
  --clientSecret <CLIENT_SECRET> `
  --tenant <TENANT_ID>

pac auth who   # always confirm active env and identity
```

`pac auth who` is cheap and catches stale auth profiles. Run it before every state-changing pac operation.

### Solution lifecycle

```powershell
# One-time clone into local directory (sets up cdsproj structure)
pac solution clone --name <SolutionUniqueName> --outputDirectory ./solution

# After maker-portal edit: incremental pull into existing src/ ("git pull from Dataverse")
pac solution sync

# After local JSON edits: static analysis before packing
pac solution check --path ./solution/src --geo UnitedStates

# Pack
pac solution pack `
  --folder ./solution/src `
  --zipfile ./out/Solution.zip `
  --packagetype Unmanaged

# Import to dev (unmanaged)
pac solution import `
  --path ./out/Solution.zip `
  --settings-file ./settings/dev.settings.json `
  --publish-changes `
  --activate-plugins `
  --async `
  --max-async-wait-time 60

# Round-trip after portal edit
pac solution sync     # incremental; in-flight local edits survive

# Generate deployment-settings template (one-time per solution)
pac solution create-settings `
  --solution-zip out/Solution.zip `
  --settings-file settings/dev.settings.json

# Promotion to higher env (managed; first import: omit --stage-and-upgrade)
pac solution import `
  --path ./out/Solution_managed.zip `
  --settings-file ./settings/uat.settings.json `
  --stage-and-upgrade `
  --publish-changes `
  --activate-plugins `
  --async `
  --max-async-wait-time 60
```

### `pac solution check` — mandatory before every import

`pac solution check` runs the Solution Checker (the same engine as the maker portal's "Run Solution Checker"). It catches: missing dependencies, deprecated connector usage, unsupported expressions, unbounded Apply-to-each loops, hard-coded URLs that should be env variables, and connection references not present in the solution.

Always run `pac solution check` before `pac solution import`. If it fails, fix the issue or explicitly document why the finding is a false positive before proceeding.

### `--activate-plugins` defaults to false

If `--activate-plugins` is omitted from `pac solution import`, flows and plugins import in a **disabled state**. Always include this flag.

### `--stage-and-upgrade` for managed upgrades

`--stage-and-upgrade` performs the import and upgrade in a single step (replacing the legacy `--import-as-holding` + `pac solution upgrade` two-step). Use it when upgrading an existing managed solution in uat/prod.

**Caveat:** it fails if the solution does not already exist in the target environment. For first-time imports, use a plain `pac solution import` without `--stage-and-upgrade`. This is confirmed by `microsoft/powerplatform-build-tools` issue #1078 with the error: "Cannot create a holding solution for missing base [SolutionName]."

### Round-tripping after portal edits

When a developer or maker edits a flow in the maker portal:

```bash
pac solution sync          # writes delta into src/; git shows the diff
git diff solution/src/Workflows/
git commit -m "Round-trip: portal change to MyFlow"
```

`pac solution sync` computes a delta and rewrites only changed files, so local in-flight edits survive if they touch different files.

---

## Flow JSON Structure and Invariants

Flow definitions conform to the Azure Logic Apps Workflow Definition Language schema:

```
https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#
```

Microsoft Learn's "Workflow Definition Language schema reference" (learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-schema) documents this URL and the full construct set.

### Top-level shape

```json
{
  "properties": {
    "connectionReferences": {
      "shared_commondataserviceforapps": {
        "runtimeSource": "embedded",
        "connection": {
          "connectionReferenceLogicalName": "pub_sharedcommondataserviceforapps_XXXX"
        },
        "api": { "name": "shared_commondataserviceforapps" }
      }
    },
    "definition": {
      "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      "contentVersion": "1.0.0.0",
      "parameters": {
        "$connections":    { "defaultValue": {}, "type": "Object" },
        "$authentication": { "defaultValue": {}, "type": "SecureObject" }
      },
      "triggers": {
        "When_a_row_is_added": {
          "type": "OpenApiConnectionWebhook",
          "inputs": {
            "host": {
              "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
              "connectionName": "shared_commondataserviceforapps",
              "operationId": "SubscribeWebhookTrigger"
            },
            "parameters": {
              "subscriptionRequest/message": 1,
              "subscriptionRequest/entityname": "pub_reservation"
            },
            "authentication": "@parameters('$authentication')"
          }
        }
      },
      "actions": {
        "Get_reservation": {
          "runAfter": {},
          "type": "OpenApiConnection",
          "inputs": { ... }
        }
      }
    }
  }
}
```

### The 6 invariants

1. **Action keys are identifiers.** Action keys cannot contain spaces — use underscores (`Get_reservation`, not `Get reservation`). Renaming an action key requires updating every `runAfter` reference and every `outputs('ActionName')` / `body('ActionName')` expression in the file. Use global find-replace when renaming.

2. **`runAfter` defines the DAG.** Every action except those running directly after the trigger must have a `runAfter` map. `runAfter: {}` means "run after trigger." Missing or dangling `runAfter` entries fail at runtime with a DAG error. Cycles are also a runtime failure.

3. **`$connections` and `$authentication` are mandatory.** Never delete these from `definition.parameters`. They are required for any flow that uses connectors. The platform injects values at runtime.

4. **`connectionReferences` top-level keys are API names; `connectionReferenceLogicalName` is the Dataverse schema name.** The top-level key (e.g. `shared_commondataserviceforapps`) is the connector API name. The `connection.connectionReferenceLogicalName` (e.g. `pub_sharedcommondataserviceforapps_XXXX`) is the Dataverse schema name of the connection reference record. Per-action `host.connectionName` must match the top-level key.

5. **Environment variables are referenced via `parameters('pub_<schemaname>')`** in WDL expressions. For example: `"@{parameters('pub_SharedMailboxAddress')}"`. Do not list environment variable names under `definition.parameters` — that block is for flow-level parameters. The runtime injects env vars automatically.

6. **Expressions use WDL syntax (`@` / `@{}`)**, not Power Fx. Power Fx is a separate action type available in some newer connectors, not the underlying expression language of flow JSON.

---

## Customizations.xml Registration

Each flow requires a `<Workflow>` entry in `solution/src/Other/Customizations.xml`:

```xml
<Workflow WorkflowId="{GUID-WITH-BRACES}" Name="Pub - Notify Approver">
  <JsonFileName>/Workflows/Pub-NotifyApprover-UPPERCASEGUID.json</JsonFileName>
  <Type>1</Type>
  <Category>5</Category>    <!-- 5=cloud flow, 6=desktop flow -->
  <Mode>0</Mode>
  <Scope>4</Scope>
  <StateCode>1</StateCode>  <!-- 1=Activated, 0=Disabled -->
  <IntroducedVersion>1.0.0.0</IntroducedVersion>
</Workflow>
```

Set `<StateCode>0</StateCode>` for test flows (prefixed `Test_`) so they import disabled in uat/prod.

Desktop flows use `<Category>6</Category>` and additionally ship binary "Desktop Flow Binaries" components — these must be explicitly added to the solution or import fails.

---

## Deployment Settings File

The deployment settings file binds connection references and sets environment variable current values per target environment. It is separate from the solution package and must never be committed inside the `.zip`.

### Generate the template (once per solution)

```powershell
pac solution create-settings `
  --solution-zip out/Solution.zip `
  --settings-file settings/dev.settings.json
```

This produces an empty template. Fill in the values and commit the file.

### Structure

```json
{
  "EnvironmentVariables": [
    { "SchemaName": "pub_SharedMailbox",   "Value": "approvals@yourorg.com" },
    { "SchemaName": "pub_TeamsChannelId",  "Value": "<teams-channel-id>" }
  ],
  "ConnectionReferences": [
    {
      "LogicalName": "pub_sharedcommondataserviceforapps_XXXX",
      "ConnectionId": "<connection-guid-from-target-env>",
      "ConnectorId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps"
    },
    {
      "LogicalName": "pub_sharedoffice365_YYYY",
      "ConnectionId": "<connection-guid-from-target-env>",
      "ConnectorId": "/providers/Microsoft.PowerApps/apis/shared_office365"
    }
  ]
}
```

One file per target environment. Commit `settings/dev.settings.json` and `settings/uat.settings.json` to git. For prod, keep connection IDs in a secrets vault if they are sensitive.

### Getting connection IDs

```powershell
pac connection list
# Or: maker portal -> Connections -> click connection -> copy ID from URL
```

### Connections must be shared with the importing identity

Before import via SPN, share every connection with the SPN's application user ("Can use" permission). If the connection is not shared, the import "succeeds" but flows stay disabled.

For user-delegated connectors (SharePoint, Outlook, Teams, Approvals): a human user must create the connection and share it with the SPN. Service principal connections are only directly supported for Dataverse (`shared_commondataserviceforapps`) via `pac connection create`.

### Environment variable default vs current value

- **Default value**: lives in the `EnvironmentVariableDefinition` XML in the solution; ships with the managed package.
- **Current value**: environment-specific; supplied via the deployment settings file at import time.

Per Microsoft Learn ("Use environment variables in Power Platform solutions"): "Environment variable definitions should be included in your solution but the values should be provided for the target environment during deployment." Never ship current values inside the managed solution package.

---

## Trigger Types

| Trigger | Use when |
|---------|---------|
| Dataverse: When a row is created/modified/deleted | React to Dataverse record changes (approvals, notifications, audit) |
| Recurrence (scheduled) | Periodic jobs (reminders, cleanup, report generation) |
| HTTP ("When an HTTP request is received") | API-like invocation; also used for test harnesses and curl-driven triggering |
| Power Apps (canvas app) | Called from a canvas app button (limited; prefer Custom API for Code Apps) |
| Child flow | Called from another flow; useful for reusable sub-logic |

**Dataverse triggers** are the most common for business logic flows. They fire asynchronously after a record create/update/delete. For synchronous validation or operations that must be transactional, use a plugin instead — flows cannot participate in the Dataverse database transaction (see "Flow vs Plugin" below).

---

## Multi-Channel Notification Pattern

A common design: when a business event occurs (e.g. a reservation is submitted), notify via multiple channels simultaneously. Each channel can fail independently without blocking the others.

```
Trigger: Dataverse "When a row is added/modified" (pub_reservation, status = Submitted)
|
|-- Get_approver_user   (Dataverse: get the assigned approver's email + AAD ID)
|
+-- [Parallel branch or sequential steps inside an error scope]
|   |
|   +-- Send_email               (Outlook/Office365 connector)
|   |     To: @{body('Get_approver_user')?['internalemailaddress']}
|   |     Subject: "New reservation awaiting approval"
|   |     Body: ... deep link to record ...
|   |
|   +-- Post_Teams_message       (Teams connector)
|   |     Channel: @{parameters('pub_TeamsApprovalChannelId')}
|   |     Message: @{triggerOutputs()?['body/pub_reservationid']}
|   |
|   `-- Create_inapp_notification (Dataverse: create pub_inappnotification row)
|         pub_recipient@odata.bind: /systemusers(@{body('Get_approver_user')?['systemuserid']})
|         pub_title: "New reservation awaiting approval"
|         pub_deeplinkpath: /reservations/@{triggerOutputs()?['body/pub_reservationid']}
```

Implementation notes:
- Wrap each notification step in a "Configure run after" scope that includes "Has failed" — so one channel failure does not stop the others.
- The in-app notification row is read by the Code App on the next page load (or on a polling interval).
- Reference channel IDs and mailbox addresses via environment variables (`parameters('pub_TeamsApprovalChannelId')`), not hardcoded values.

---

## FlowRun Elastic Table — Reading Run History

Flow run history is written to the Dataverse `flowruns` elastic table. Per Microsoft Learn ("Manage cloud flow run history in Dataverse"): admins configure retention via `FlowRunTimeToLiveInSeconds` on the Organization table (default 28 days; options: 28, 14, 7 days, or Disabled).

Query for recent runs of a specific flow:

```http
GET /api/data/v9.2/flowruns
  ?$select=name,status,starttime,endtime,errorcode,errormessage,resourceid
  &$filter=resourceid eq '<workflow-id>'
  &$orderby=starttime desc
  &$top=10
```

`status` values: `Running`, `Succeeded`, `Failed`, `Cancelled`.

**Important caveats:**
- "The underlying data stream is not transactional and hence is not 100 percent lossless." (Microsoft Learn)
- "The flow run history is not updated instantly in Dataverse — there can be a delay before the data is available."
- For exhaustive history, the maker-portal run-detail view remains the authoritative source.

Use the flow's `workflowid` as the `resourceid` filter value. Find it:

```
GET /api/data/v9.2/workflows?$filter=name eq 'Pub - Notify Approver'&$select=workflowid
```

The agent reads `status` and `errormessage` from `flowruns` to self-correct during the authoring loop.

---

## Testing Flows

### Triggering test runs

| Method | Command |
|--------|---------|
| HTTP trigger | `curl -X POST -H 'Content-Type: application/json' -d '{...}' <flow-url>` |
| Dataverse row create | POST to the entity set — the Dataverse trigger fires |
| Dataverse row update | PATCH an existing record to match the trigger condition |

There is no `pac flow run` command. The trigger surface is the API.

### Test harness flows

Create sibling flows named with a `Test_` prefix. They use a manual HTTP trigger and create the triggering data (or call the flow-under-test as a child flow). Set `<StateCode>0</StateCode>` in `Customizations.xml` so they import disabled in uat/prod.

```xml
<Workflow WorkflowId="{...}" Name="Test_NotifyApprover">
  <JsonFileName>/Workflows/Test_NotifyApprover-GUID.json</JsonFileName>
  <Category>5</Category>
  <StateCode>0</StateCode>
```

### Static output mocking

Power Automate's "static outputs" feature lets you mock any action's response with fixed data for testing purposes, without hitting external APIs. Per Microsoft Learn ("Test cloud flows"): "The static outputs option in Power Automate lets you run an action with mock data." Configure this in the maker portal for development-time testing of flows that call external connectors.

### Verifying after import

```powershell
# 1. Confirm flow imported and is active
GET /api/data/v9.2/workflows?$filter=name eq 'Pub - Notify Approver'&$select=statecode,statuscode

# 2. Trigger the flow (create a test record)
$body = @{ pub_name = "test-run"; pub_status = 2 } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri "$envUrl/api/data/v9.2/pub_reservations" `
  -Headers $headers -Body $body -ContentType "application/json"

# 3. Wait 10-30s then check flowruns
GET /api/data/v9.2/flowruns?$filter=resourceid eq '<workflow-id>'
  &$select=status,errormessage&$orderby=starttime desc&$top=3
```

The "done" criterion for a flow change: `pac solution check` clean -> import green -> FlowRun `status=Succeeded` within 60 seconds.

---

## When to Use a Flow vs a Plugin

Use a **flow** for:
- Multi-step orchestration spanning multiple systems (email, Teams, SharePoint, external APIs)
- Asynchronous post-commit notifications and side effects
- Scheduled jobs (recurrence trigger) that do not need transactional guarantees
- Low-code scenarios where a maker should own the logic long-term

Use a **plugin** for:
- Synchronous validation that must abort a write (PreValidation stage)
- Transactional operations: sequence issuance, atomic multi-record writes (Rule 14)
- Deterministic transforms on Dataverse data (no external I/O)
- Operations that must succeed-or-abort atomically with no partial state

**A flow cannot participate in the Dataverse database transaction.** If the triggering record write succeeds but the flow fails, you end up with inconsistent data. Any operation that must be atomic with the record write must be a synchronous plugin, not a flow.

See [plugins-and-custom-apis.md](./plugins-and-custom-apis.md) for the plugin pattern and Rule 14 concurrency-safe issuance.

---

## Common Gotchas

| Gotcha | Fix |
|--------|-----|
| Flows disabled after import | Always pass `--activate-plugins` to `pac solution import` |
| `--stage-and-upgrade` fails on first import | Omit for first import to a new env; use for upgrades only |
| SPN-imported flows stay disabled | Share all connection references with SPN application user as "Can use" |
| User-delegated connectors fail with SPN | Seed connection via human user; share with SPN after |
| `pac solution check` fails on Apply-to-each | Add a record-limit setting to the loop action |
| Action UI metadata creates noisy diffs | Acceptable; do not strip (breaks maker-portal friendliness) |
| Parallel branches with shared state race | Isolate side effects per branch; do not write to the same record in parallel steps |
| `@{parameters('pub_MyVar')}` has no value | Check that the settings file for the target env has the `SchemaName` entry |
| Flow JSON `runAfter` dangling reference | Rename propagated? Recheck all `runAfter`, `outputs()`, `body()` references |

---

## Step-by-step: Add a Solution-Aware Flow with Connection Reference and Env Var

1. In the maker portal, create a stub flow (trigger + one action) to generate the connection reference scaffold and JSON skeleton.
2. Run `pac solution sync` to pull the JSON and connection reference XML into `solution/src/`.
3. Edit the flow JSON: add actions, `runAfter` dependencies, env var references (`@{parameters('pub_MyVar')}`), error scopes.
4. Validate: `pac solution check --path ./solution/src --geo UnitedStates`.
5. Pack: `pac solution pack --folder ./solution/src --zipfile ./out/Solution.zip --packagetype Unmanaged`.
6. Import to dev: `pac solution import --path ./out/Solution.zip --settings-file ./settings/dev.settings.json --publish-changes --activate-plugins --async --max-async-wait-time 60`.
7. Trigger the flow and read `flowruns` to verify `status=Succeeded`.
8. Update `settings/<env>.settings.json` for uat/prod with environment-specific connection IDs and variable values.
9. Add the flow's `<Workflow>` entry to `Other/Customizations.xml` with `<StateCode>1</StateCode>`.
10. Commit: `solution/src/Workflows/<flow>.json`, `Other/Customizations.xml`, `settings/<env>.settings.json`.
