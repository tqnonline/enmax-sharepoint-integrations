# ADR-0016: Workflow topology — shared engine + gated trigger workflows

**Status:** Accepted, amended (file-trigger workflow removed 2026-08-11)
**Date:** Phase 3, amended 2026-08-11

## Context

Multiple trigger surfaces (a time-based poll, a file-arrival event, an
on-demand manual run) all need to perform the exact same copy logic
without duplicating it three times.

## Original decision (Phase 3)

Three thin trigger workflows — `wf-scheduled-copy` (15-minute recurrence),
`wf-file-trigger-copy` (File System "on new file" event), and
`wf-ondemand-copy` (HTTP request) — each call one shared engine,
`wf-copy-invoices` (its own Request trigger, `concurrency.runs = 1`), via
the built-in `Workflow` action type. Single source of truth for copy
logic; the engine's own concurrency limit plus its own re-list-and-check
on every invocation guarantees correctness regardless of which trigger
woke it.

## Amendment (2026-08-11)

Business confirmed comfort with the 15-minute scheduled poll plus
on-demand runs alone — the file-created-event trigger provided no
material benefit over the existing poll cadence at this volume. Removed
`wf-file-trigger-copy` entirely, along with its `FILE_TRIGGER_ENABLED`
app setting and `fileTriggerEnabled` Bicep parameter.
`FILESHARE_TRIGGER_FOLDER` and the underlying `filesystem` connection
remain — they're still used directly by the engine's own
`List_Files_In_Folder`/`Get_File_Content` polling, independent of the
removed watcher workflow.

## Current topology (as of this writing)

`wf-scheduled-copy` + `wf-ondemand-copy` → `wf-copy-invoices`, plus
`wf-daily-digest`, `wf-run-digest`, `wf-send-digest-email` — six workflows
total. See both trigger workflows' own gating mechanism in ADR-0009's
consequences and [`../operations/runbook.md`](../operations/runbook.md).

## Consequences

- Verified live after removal: exactly 6 workflows present (not 7), a
  direct query for `wf-file-trigger-copy` returns `WorkflowNotFound`.
