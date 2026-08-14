# ADR-0023: FileRunEvents — per-file-per-run audit trail

**Status:** Accepted
**Date:** 2026-08-11

## Context

The daily digest's headline numbers (e.g. Seen=272, Copied=48, Skipped=92,
Failed=32 — internally inconsistent, since 48+92+32=172 ≠ 272) did not
reconcile with the CSV attachment (17 rows). Root cause: the digest summed
per-run **attempt** counters from `RunLog` across the whole period, while
the CSV was built from `ProcessedFiles`' one-row-per-**distinct-file**
current state — two different data models that can never reliably
reconcile. A file retried across several polls (or, in the specific
incident, re-tested against several different intermediate code versions
during live debugging) gets counted once per attempt in `RunLog` sums but
only once (its final state) in `ProcessedFiles`/the CSV.

## Decision

New `FileRunEvents` table: one row per (file × run) outcome.
`PartitionKey = yyyyMM` of run start (mirrors `RunLog`'s convention),
`RowKey = {RunId}_{DedupKey}` (reuses ADR-0017's dedup key). `wf-copy-
invoices` writes one additional row alongside each of its 4 existing
per-file terminal branches (Skipped/Abandoned-invalid/Copied/Abandoned/
Failed) — purely additive, no existing logic paths touched.

Digest metrics were redesigned as a result: `filesCopied`/`filesFailed`/
`filesAbandonedThisPeriod` come directly from `ProcessedFiles.Status`
(already distinct-by-file); `filesSkipped` — the one metric
`ProcessedFiles` structurally cannot represent, since a skip is a no-op
with nothing upserted — comes from `FileRunEvents`, deduplicated by
`DedupKey` (`union(arr, arr)`, the idiomatic WDL dedup trick, since no
`distinct()` function exists). `filesSeen` is the sum of all four,
proven mutually exclusive per distinct file.

## Alternatives presented to the user

(a) rework digest metrics to distinct-file counting only; (b) same, plus
address the separate source-folder-growth issue (ADR-0003's consequence);
(c) treat the observed discrepancy as a one-time dev-testing artifact and
leave the design as-is. The user chose to go further than (a): build a
durable, general-purpose per-file-per-run audit trail with **indefinite
retention, no purge job** (an explicit choice, since Table Storage has no
native TTL — see ADR-0028 for the later cleanup tooling).

## Consequences

- Verified live: the internal identity (Seen = Copied + Skipped + Failed +
  Abandoned) now holds exactly, and `filesCopied` matches the CSV's actual
  row count by construction, not by coincidence.
- A real bug was caught during the fix: `union(arr, createArray())` is
  invalid WDL (`createArray()` requires at least one argument) — fixed to
  `union(arr, arr)`.
