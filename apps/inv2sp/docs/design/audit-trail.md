# State model and audit trail

## Four tables, four different jobs

| Table | Grain | Written by | Read by | Purpose |
|---|---|---|---|---|
| `ProcessedFiles` | One row per **distinct file** (upserted in place) | `wf-copy-invoices` | `wf-copy-invoices` (dedup lookup), `wf-daily-digest`/`wf-run-digest` (CSV + counts) | Current status per file: `Succeeded`, `Failed`, or `Abandoned`. Never records a "skip" — a skip is a no-op, nothing is upserted. |
| `RunLog` | One row per **run** | `wf-copy-invoices` | `wf-daily-digest`/`wf-run-digest` (`runsExecuted`/`runsWithIssues`) | Run-level outcome and per-run counters. |
| `AlertState` | One row (global, fixed key) | `wf-copy-invoices` | `wf-copy-invoices` (cooldown check) | Tracks the last immediate-alert send time, for cooldown enforcement. |
| `FileRunEvents` | One row per **(file × run) outcome** | `wf-copy-invoices` | `wf-daily-digest` (Skipped-count), operators (ad hoc audit queries) | Durable audit trail — which run identified/copied/skipped/failed which file. See [ADR-0023](../decisions/0023-fileRunEvents-audit-trail.md). |

## Why `FileRunEvents` exists (and why it isn't redundant with `ProcessedFiles`)

`ProcessedFiles` is an **upsert-in-place, current-state** table — for a
given file, only its most recent attempt's outcome is visible. This is
exactly right for dedup (`wf-copy-invoices` only ever needs to know "is
this file already done?"), but it cannot answer:

- "Which run copied file X, specifically?" once a later run has changed
  that file's row again (it can't — there is only ever one row).
- "How many times was file Y skipped as a duplicate?" (never recorded at
  all — a skip touches no table).
- "What happened to file Z during the outage on August 10th?" if Z has
  since succeeded and its row now shows only the final, successful
  attempt.

`FileRunEvents` answers all three, because every outcome from every run
gets its own row (`RowKey = {RunId}_{DedupKey}`), and rows are **never**
overwritten by a later run.

### Schema

| Field | Example | Notes |
|---|---|---|
| `PartitionKey` | `202608` | `yyyyMM` of the run's start time — mirrors `RunLog`'s partitioning convention. |
| `RowKey` | `{RunId}_{DedupKey}` | Reuses [ADR-0017](../decisions/0017-dedup-key-design.md)'s dedup key; guarantees one row per file per run. |
| `RunId` | guid | |
| `DedupKey` | base64 string | Join key back to `ProcessedFiles`. |
| `FileName`, `SourcePath` | | |
| `Outcome` | `Copied \| Skipped \| Failed \| Abandoned` | Folders are never recorded here (see [engine.md](engine.md)). |
| `TriggerType` | `Scheduled \| OnDemand \| FileTrigger` | |
| `TriggeredByWorkflow` | `wf-scheduled-copy` | Added [ADR-0027](../decisions/0027-triggeredbyworkflow-tracking.md); `'Unknown'` for rows predating this field. |
| `EventTimeUtc` | ISO-8601 | |
| `AttemptCount`, `ErrorCategory` | | Empty for `Copied`/`Skipped`. |

### Retention

Indefinite by default (Azure Table Storage has no native TTL) — an
explicit choice, see [ADR-0023](../decisions/0023-fileRunEvents-audit-trail.md).
Cleaned up on demand via
[`Clear-FileRunEvents.ps1`](../operations/scripts-reference.md#clear-filerunevents.ps1)
([ADR-0028](../decisions/0028-fileRunEvents-retention-cleanup.md)).

## How the daily digest computes its numbers

`wf-daily-digest` (rolling 24h window) derives every headline number from
**distinct files**, never from summing per-run attempt counters — this is
the fix for the reconciliation bug in ADR-0023:

- `filesCopied` = count of `ProcessedFiles` rows with `Status = Succeeded`
  and `LastAttemptUtc` in the period.
- `filesFailed` = count of `ProcessedFiles` rows with `Status = Failed`
  and `LastAttemptUtc` in the period (i.e. genuinely *still* stuck right
  now, not "failed at some point but has since succeeded" — a file that
  failed twice then succeeded within the period is counted once, under
  `filesCopied`).
- `filesAbandonedThisPeriod` = count of `ProcessedFiles` rows with
  `Status = Abandoned` and `LastAttemptUtc` in the period.
- `filesSkipped` ("Already on file") = count of **distinct** `DedupKey`
  values with a `Skipped` event in `FileRunEvents` in the period
  (deduplicated via `union(arr, arr)` — WDL has no `distinct()` function).
- `filesSeen` ("Invoices detected") = the sum of the four above. These are
  proven mutually exclusive per distinct file: a file's current
  `ProcessedFiles` status is exactly one of the three, and a
  `Skipped`-in-period file's `LastAttemptUtc` necessarily falls *outside*
  the period (otherwise it wouldn't have been skipped), so there is no
  overlap between the `Skipped` count and the other three.

The CSV attachment is built from the same `ProcessedFiles` query used for
`filesCopied`/`filesFailed`/`filesAbandonedThisPeriod` — the headline
numbers and the CSV are guaranteed to reconcile because they come from the
same single source of truth.

`wf-run-digest` (a single run's own scoped digest) does **not** need any
of this — it reads that one run's own already-internally-consistent
`RunLog` row directly, since the cross-run attempt-vs-distinct-file
conflation only arises when *summing across many runs*.
