# ADR-0025: Digest content depth, cadence, and always-send policy

**Status:** Accepted
**Date:** Phase 2, reconfirmed 2026-08

## Context

Balance a genuinely useful, complete digest against readability and email
deliverability limits; and decide whether a zero-activity day should
still produce an email.

## Decision

- **Depth:** comprehensive — source path, destination path, which run,
  what was abandoned, and an explicit remediation category per failure.
  The email **body** is limited to a summary plus an action-required
  section (untruncated, carried forward until resolved); full per-file
  detail for every copied/failed file lives in the **CSV attachment
  only**.
- **Cadence:** sends every morning at 07:00 America/Edmonton, covering the
  previous rolling 24 hours.
- **Always sends**, even on a zero-activity day. If the digest were
  skipped on quiet days, silence would become ambiguous with a genuinely
  dead workflow — a risk this integration explicitly designs against
  (see ADR-0011).
- **Recipients are split**: alert emails go to a technical distribution
  list; digest emails go to a business/finance distribution list. Alert
  noise is not wanted by business recipients.

## Alternatives considered

- Simple counts-only summary — superseded by the more detailed
  requirement above.
- A row cap (e.g. 100 rows) inline plus CSV — superseded by CSV-only for
  full per-file detail, keeping the email body itself readable at any
  volume.
- No cap anywhere — rejected: unreadable/potentially undeliverable at real
  volume.
- A SharePoint/blob link instead of an attachment — not needed; the O365
  connector supports attachments directly.
- Only show abandoned items within a rolling 24h window — rejected: an
  unresolved issue would silently scroll out of view. The abandoned
  backlog is carried forward in every digest, unbounded by time, until
  explicitly resolved (see ADR-0018's `Reset-AbandonedFiles.ps1`).

## Consequences

- Re-implemented on top of ADR-0022's shared-template architecture and
  ADR-0023's reconciled, distinct-file-based metrics.
