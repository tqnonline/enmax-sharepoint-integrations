# ADR-0027: `TriggeredByWorkflow` tracking

**Status:** Accepted
**Date:** 2026-08-11

## Context

The CSV attachment already carried a `RunId` (an opaque GUID) and
`TriggerType` (a generic `Scheduled`/`OnDemand`/`FileTrigger` enum), but
neither answers "which **workflow**" unambiguously or by name — the user
wanted the report to say explicitly which workflow copied each file.

## Decision

Each caller workflow (`wf-scheduled-copy`, `wf-ondemand-copy`) now passes
its own `workflow().name` into `wf-copy-invoices` as a new, optional
`triggeringWorkflow` request field (optional, not in the trigger schema's
`required` list, so this stays backward compatible if a future caller
omits it). Captured once per run into a `TriggeringWorkflow` variable
(`coalesce(..., 'Unknown')` fallback), written as `TriggeredByWorkflow`
alongside every existing `TriggerType` write — `ProcessedFiles` (4
places), `FileRunEvents` (5 places), and `RunLog` (a bonus addition, same
rationale, same field). Both digest workflows' CSVs gained a
`TriggeredByWorkflow` column, using `coalesce(...,'Unknown')` so rows
written before this change degrade gracefully instead of breaking.

## Consequences

- Verified live: a real on-demand run produced
  `TriggeredByWorkflow: wf-ondemand-copy` in both `FileRunEvents` and
  `RunLog`; a re-triggered digest's actual CSV output showed the new
  column, with the pre-existing rows correctly falling back to
  `'Unknown'`.
