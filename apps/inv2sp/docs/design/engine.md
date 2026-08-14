# Engine design — `wf-copy-invoices`

`wf-copy-invoices` is the single shared copy engine (see
[ADR-0016](../decisions/0016-workflow-topology-shared-engine.md)). Every
trigger workflow (`wf-scheduled-copy`, `wf-ondemand-copy`) calls it via the
built-in `Workflow` action type; it never runs on its own schedule.

## Trigger contract

Request trigger, `concurrency.runs = 1` (only one execution of the engine
at a time, regardless of which caller invoked it — the engine's own
re-list-and-check on every run is what makes concurrent triggers safe, not
locking). Request body:

```json
{
  "triggerType": "Scheduled | FileTrigger | OnDemand",   // required
  "triggeringWorkflow": "wf-scheduled-copy"               // optional, added 2026-08-11 (ADR-0027)
}
```

`triggeringWorkflow` is optional and defaults to `'Unknown'`
(`coalesce(triggerBody()?['triggeringWorkflow'], 'Unknown')`) so older or
future callers that omit it never break the run.

## Per-file processing loop

For every item returned by `List_Files_In_Folder` (a raw array — this
connector does **not** wrap results in `{value: [...]}`, and does **not**
support Logic Apps' native pagination handling against a non-paginated
response — see
[connectors.md](connectors.md#file-system-connector) — enabling
pagination against it fails every single call, not just large folders):

1. **`Is_Folder`** — subfolders are a normal, expected reality of a file
   share, not a data-quality problem. Counted as `Skipped`, never written
   to `ProcessedFiles` or `FileRunEvents` (nothing meaningful to track per
   folder).
2. **Dedup lookup** — compute the dedup key
   ([ADR-0017](../decisions/0017-dedup-key-design.md)), query
   `ProcessedFiles` for an existing record.
3. **`Already_Terminal`** — if the existing record's status is `Succeeded`
   or `Abandoned`, skip (no re-attempt). Counted as `Skipped`.
4. **`Validate_File`** — pre-flight checks: illegal filename characters
   (`< > : " / \ | ? *`) and the File System connector's hard 30 MB size
   limit ([connectors.md](connectors.md#file-system-connector)). Either
   failure is **not retryable** and goes straight to `Abandoned`
   ([ADR-0018](../decisions/0018-retry-abandonment-state-machine.md)).
5. **`Attempt_Copy_Scope`** — reads the file content, checks whether it
   already exists at the destination (self-heals to `Succeeded` if so,
   without re-uploading), otherwise creates it in SharePoint.
6. **`On_Copy_Success`** — checks `Create_File`'s (or
   `Check_SharePoint_Existing`'s) own action status directly, **not** the
   containing scope's aggregate status. This matters: an expected 404 from
   the "does it already exist" check makes the scope's own aggregate
   status `Failed` even when the actual copy succeeded — checking the
   individual terminal action's status avoids a false-negative here.
7. On failure: classify via the error taxonomy
   ([ADR-0019](../decisions/0019-error-taxonomy.md)), increment
   `AttemptCount`, and either mark `Failed` (retryable, will be picked up
   by the next poll) or `Abandoned` (once `AttemptCount` reaches
   `MAX_ATTEMPTS`).

Every one of these five terminal outcomes (`Skipped`-folder,
`Skipped`-terminal, `Abandoned`-invalid, `Copied`, `Abandoned`/`Failed`
after a real attempt) increments exactly one in-memory counter
(`FilesSeen`/`FilesCopied`/`FilesSkipped`/`FilesFailed`/`FilesAbandoned`)
and — except for folders — writes exactly one row to `ProcessedFiles` and
one row to `FileRunEvents` (see
[audit-trail.md](audit-trail.md)). This invariant
(`FilesSeen = FilesCopied + FilesSkipped + FilesFailed + FilesAbandoned`)
holds per run by construction; it does **not** automatically hold across
multiple runs summed together — see
[audit-trail.md](audit-trail.md) for why the digest
stopped relying on summing per-run counters across a time period.

## Run-level completion

`Upsert_RunLog` writes one row per run to `RunLog` regardless of the
Foreach's own outcome (`runAfter: [Succeeded, Failed, Skipped, TimedOut]`),
then `Should_Send_Immediate_Alert` evaluates whether this run's activity
warrants an immediate alert
([ADR-0020](../decisions/0020-alert-suppression-cooldown.md)).

## Known limitation

If an unhandled exception occurs strictly *between* `Increment_FilesSeen`
(the very first action in a file's iteration) and any of the five terminal
branches, the file is counted as "seen" with no corresponding terminal
bucket and no `ProcessedFiles`/`FileRunEvents` row — a "phantom seen"
event. This was observed once, during active live redeployment against an
intermediate, since-fixed code version (see
[ADR-0023](../decisions/0023-fileRunEvents-audit-trail.md) for how the
digest was made resilient to this class of data anomaly). The underlying
gap — no catch-all fallback branch for a genuinely unexpected exception
mid-iteration — is not proven to be closed for every possible failure
mode; see
[`../operations/known-issues.md`](../operations/known-issues.md).
