# ADR-0026: Recurrence trigger timezone — Windows TZ IDs, not IANA

**Status:** Accepted
**Date:** Phase 3

## Context

The daily digest needs to fire reliably at 07:00 America/Edmonton local
time.

## Decision

Verified against Microsoft's Recurrence trigger documentation before
writing the workflow: Recurrence triggers require **Windows time zone
IDs** (e.g. `"Mountain Standard Time"`), not IANA strings
(`"America/Edmonton"`). The trigger's `recurrence.timeZone` hardcodes the
Windows TZ ID; the IANA string is retained only as human-readable display
text inside the digest email body itself (via `convertFromUtc`, which does
accept IANA-style names for display formatting).

## Rationale

Using an IANA string directly in `recurrence.timeZone` would have either
silently misfired the intended 07:00 schedule or failed trigger
registration entirely — this was verified and avoided proactively, before
shipping, rather than discovered live.

## Consequences

- Anyone adding a new Recurrence-triggered workflow to this project should
  follow the same pattern: Windows TZ ID for the trigger, IANA string only
  for human-facing display text.
