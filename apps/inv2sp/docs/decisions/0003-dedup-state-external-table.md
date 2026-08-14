# ADR-0003: Dedup state — external Azure Table, source file untouched

**Status:** Accepted
**Date:** Phase 2 planning

## Context

The engine must not re-copy a file it has already successfully processed,
without disturbing the on-premises source share (which may be managed by
another team/process).

## Decision

Track processing state in an external `ProcessedFiles` Azure Table (one row
per distinct file, upserted). Source files are **never moved or deleted**
after a successful copy — they remain on the share exactly as found.

## Alternatives considered

- **Move to an Archive folder after copy** — cleaner from a "what's still
  pending" standpoint, but rejected in favor of external tracking (a
  deliberate choice to leave the source share's contents fully under the
  upstream owner's control).
- **Delete after copy** — destructive, rejected outright.

## Consequences

- `ProcessedFiles` never shrinks while source files remain on the share —
  every historical file gets re-listed and re-checked (as an already-
  terminal skip) on every scheduled poll, forever. This is a known,
  accepted growth characteristic, not a bug — see
  [`../operations/known-issues.md`](../operations/known-issues.md) for the
  practical effect on digest metrics (mitigated by ADR-0023's distinct-file
  accounting, but the underlying share itself is not pruned by this
  integration).
- **Open design gap, not yet resolved:** `ProcessedFiles` has no
  reconciliation against actual SharePoint state. If a file is deleted from
  SharePoint after being marked `Succeeded`, the engine has no mechanism to
  detect this and will never re-copy it. Flagged, pending a decision on
  whether periodic reconciliation is needed.
- Pruning the share itself (if ever desired) is a business-owned process,
  explicitly out of scope for this integration.
