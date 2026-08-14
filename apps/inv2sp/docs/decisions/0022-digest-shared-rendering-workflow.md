# ADR-0022: Digest architecture — shared rendering workflow

**Status:** Accepted
**Date:** 2026-08-10

## Context

Two requirements: (1) an on-demand run should send its own scoped digest
immediately, not wait for the next scheduled daily digest; (2) email
formatting needed to become branded and business-ready for a
finance/accounting audience, not the placeholder styling used previously.

## Decision

Split digest responsibilities across three workflows:

- **`wf-send-digest-email`** — the single source of truth for the branded
  HTML template and the actual `office365` send. Takes structured stats as
  input; owns 100% of presentation logic.
- **`wf-run-digest`** — queries `RunLog` for one specific run plus
  `ProcessedFiles` filtered to that `RunId` for the CSV, plus the full
  all-time abandoned backlog, then calls `wf-send-digest-email`.
- **`wf-daily-digest`** — kept its existing time-window aggregation logic;
  only the HTML-building/email-sending was replaced with a call to the
  shared workflow.

`wf-ondemand-copy` was modified to call `wf-run-digest` after
`Call_Engine`, regardless of the engine's own outcome — a failed run
should still notify immediately, not wait silently.

## Rationale

Ensures the daily and on-demand digests always render identically; any
future formatting change only needs to happen once, in one workflow.
The on-demand digest deliberately still surfaces the *complete* current
abandoned backlog (not just that run's own files), so finance/accounting
always sees the full current picture regardless of which digest they
happen to be reading.

## Branding decision

CSS-only styling, no embedded logo image — raw SVG/embedded images do not
render reliably in desktop Outlook, the likely primary client for this
audience. Exact ENMAX red (`#E31837`) was extracted from the real logo
source files. Table-based layout with only inline styles throughout (no
`<style>` blocks, which desktop Outlook does not support reliably). This
reasoning applies project-wide to any future email work, not just this
digest.

## Consequences

- **Visually confirmed by the user in an actual inbox (2026-08) — branding
  approved.** OK and DEGRADED health-badge variants have both been seen
  live (the DEGRADED variant via a real "48 filed, 32 retrying" digest
  screenshot during the count-reconciliation investigation, see
  ADR-0023); the FAILED (red, "Action Required") variant has not yet been
  exercised with a genuine abandoned file — see
  [`../operations/known-issues.md`](../operations/known-issues.md).
