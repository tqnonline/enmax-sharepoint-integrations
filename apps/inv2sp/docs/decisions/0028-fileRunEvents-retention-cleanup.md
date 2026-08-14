# ADR-0028: `FileRunEvents` retention/cleanup tooling

**Status:** Accepted
**Date:** 2026-08-11

## Context

Retention for `FileRunEvents` was deliberately left indefinite/no-purge at
ADR-0023 (an explicit user choice at the time — Azure Table Storage has no
native TTL). The user later asked for a way to clean up specific months,
or the oldest N months, of that table's data.

## Decision

`scripts/Clear-FileRunEvents.ps1`, with two mutually exclusive modes:

- `-OlderThanMonths N` — retention-window mode, relative to today: keeps
  the current calendar month plus the N-1 preceding months, deletes
  everything in any older monthly partition (lexical `yyyyMM`
  partition-key string comparison, which sorts identically to
  chronological order for this fixed format).
- `-Month yyyy-MM` — exact single-partition target, for a one-off manual
  purge regardless of today's date.

Defaults to a dry-run preview (row/partition counts that would be
deleted); requires interactive confirmation, `-Force`, or supports
`-WhatIf` before permanently deleting anything (matches this repo's
existing `SupportsShouldProcess`/`ConfirmImpact = 'High'` script
convention, same pattern as `Reset-AbandonedFiles.ps1`).

## Rationale

The delete is permanent and irreversible — Table Storage entities have no
soft-delete/recycle bin. "3 months" was a genuinely ambiguous request
(a relative retention window vs. "the oldest 3 partitions currently
present, regardless of how old they actually are") — the user was asked
to disambiguate before this was built, and chose the retention-window
semantics as primary, plus the exact-month mode for one-off purges.

## Consequences

- A real PowerShell bug was caught during live testing: `Group-Object`
  returns a single, **unwrapped** `GroupInfo` object (not an array) when
  there is exactly one group — `.Count` on that unwrapped object silently
  resolves to the number of items *in* that group, not the number of
  groups. Fixed by wrapping in `@(...)`, the same defensive pattern
  already used elsewhere in the script.
- Verified live, twice: a `-WhatIf` preview left real data untouched
  (confirmed via direct table query afterward); a real delete against a
  synthetic old-month test row removed exactly that row while leaving all
  real current-month data intact (also confirmed via direct table query,
  not just the script's own report).
