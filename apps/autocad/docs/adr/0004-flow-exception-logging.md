# ADR 0004 - Flow and application exception logging

- Status: Accepted
- Date: 2026-07-14
- Related: ADR 0002 (email notifications), [`deploy_flows.py`](../../solution/scripts/deploy_flows.py)

## Context

Power Automate flows and the Code App had no durable operational error log. Failures were visible only in the Power Automate run history or the browser console (`logDataverseError`). Flow display names used legacy snake_case folder slugs in Maker, and action names were inconsistent. When a flow failed in production, support could not tie a user-visible symptom to a specific action, error message, or run instance without opening Maker manually.

Audit events (`enmax_autocadauditevent`) record business lifecycle facts (created, approved, state changed). They are the wrong place for technical failures: no run URL, no failed action name, no stack/detail payload, and mixing ops telemetry with audit would complicate compliance reporting.

## Decision

1. **Dedicated exception table** — `enmax_autocadflowexception` stores append-only failure rows from **Flow**, **CodeApp**, and **Plugin** origins (`enmax_acdnorigin` optionset, value 3 = Plugin). Immutable after create; admins read globally; authenticated users may create (append-only logging).

2. **Flow display names** — Maker display name follows **`Enmax AutoCAD | {Trigger} | {Action}`** in Title Case. Dataverse webhook triggers use **`On Create of {Entity}`** / **`On Update of {Entity}`**. Source folder slugs (e.g. `Manual_Refresh_SharePoint_Index`) stay stable in git; [`solution/flows/flow_catalog.yaml`](../../solution/flows/flow_catalog.yaml) maps slug → display name for deploy.

3. **Central child logger** — `Child_Log_Flow_Exception` is the sole writer invoked from parent catch scopes. Inputs carry flow display name, failed action, error message/code/detail, run id/URL, correlation id, and optional subject table/id.

4. **Build-time error scaffold** — [`build_flow_error_handling.py`](../../solution/scripts/build_flow_error_handling.py) wraps each flow definition in `Scope_Try_Main` with a catch path that calls the child logger then terminates failed. Correlation id is initialized at flow start (`guid()`).

5. **Code App persistence** — [`exceptionLogger.ts`](../../code-app/src/telemetry/exceptionLogger.ts) extends `logDataverseError`: console first (Rule 12), then fire-and-forget create on `enmax_autocadflowexceptions`. Logger failures never block UI. Secrets redacted from detail JSON.

6. **Action naming** — Power Automate actions use `{Verb}_{Object}[_{Qualifier}]` (e.g. `Get_DocControl_Email_Config`, `Invoke_IssueNumbers`). Scopes prefixed `Scope_`.

7. **Subject lookups** — Flow create steps use plain GUID fields for subject references, not `@odata.bind` (activation-safe).

8. **Plugin origin + soft-fail policy** — `ExceptionEmitter.cs` (`solution/plugins/IssueNumbers/`) mirrors `AuditEmitter` but writes to `enmax_autocadflowexception` with origin = Plugin, severity, error message/code/detail, failed action (`{PluginClass}.{Method}`), correlation id (`PluginExecutionContext.CorrelationId`), subject table/id, and acting user. `Log()` wraps its own `Create` in try/catch and never throws, so a logging failure can never mask or replace the original exception.
   - **Async steps** (e.g. `AutoCreateDrawingsPlugin`, which runs off the already-committed reservation-approval transaction): the entire `ExecuteDataversePlugin` body is wrapped — log and return, never rethrow, since faulting here only produces a silent failed async job.
   - **Synchronous steps with side effects** (e.g. `OnReservationCreatedPlugin`): only the side effect (approver/admin notification fan-out) is wrapped. The core write (the audit event for the reservation itself) stays outside the try block and transactional — a notification failure must never roll back the reservation that already succeeded.

## Flow naming catalog (summary)

| Folder slug | Display name |
|-------------|--------------|
| `Manual_Refresh_SharePoint_Index` | Enmax AutoCAD \| On Demand \| Refresh & Update SharePoint Links for Drawing-Document Records |
| `Scheduled_SharePoint_Indexer_Full` | Enmax AutoCAD \| Scheduled \| Full Sweep of SharePoint Links for Drawing-Document Records |
| `Scheduled_SharePoint_Indexer_Incremental` | Enmax AutoCAD \| Scheduled \| Incremental Sweep of SharePoint Links for Drawing-Document Records |
| `On_Checkout_Created_Email_Notifications` | Enmax AutoCAD \| On Create of Checkout \| Send Notification Emails |
| `On_Checkout_Updated_Email_Notifications` | Enmax AutoCAD \| On Update of Checkout \| Send Lifecycle Emails |
| `On_Reservation_Created_Notify_Admins` | Enmax AutoCAD \| On Create of Reservation \| Notify Document Control of Pending Approval |
| `On_Reservation_Approved_Issue_Drawings` | Enmax AutoCAD \| On Update of Reservation \| Issue Drawing Numbers When Approved |
| `On_Reservation_Declined_Notify_Requester` | Enmax AutoCAD \| On Update of Reservation \| Notify Requester When Declined |
| `Child_Log_Flow_Exception` | Enmax AutoCAD \| Internal \| Log Flow Exception |
| `Child_Send_System_Email` | Enmax AutoCAD \| Internal \| Send System Email From Shared Mailbox |
| `Child_Send_Approval_Needed_Email` | Enmax AutoCAD \| Internal \| Send Reservation Approval Needed Email |
| `Child_Send_Approval_Result_Email` | Enmax AutoCAD \| Internal \| Send Reservation Approval Result Email |
| UAT flows | Enmax AutoCAD \| On Demand \| UAT … |

## Consequences

- Flows must be **recreated** when display names change (`deploy_flows.py --recreate`); orphan snake_case flows are deleted during cleanup.
- Exception table grows without bound; retention/purge policy is a future ops task.
- Code App requires create privilege on `enmax_autocadflowexception` for all authenticated roles that should log client errors.
- Generated Power Apps data source must be refreshed after schema import for typed create from the app.

## Alternatives considered

- **Extend audit event** with Flow Failed + error fields — rejected; mixes business audit with ops telemetry and lacks run URL semantics.
- **Application Insights only** — rejected; no first-class link from Dataverse records or Maker run history for admins already working in Power Platform.
