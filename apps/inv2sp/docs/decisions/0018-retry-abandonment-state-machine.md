# ADR-0018: Retry/abandonment state machine

**Status:** Accepted
**Date:** Phase 2/3

## Context

Need a bounded, auditable retry model — neither infinite silent auto-retry
(which can mask a real, unresolved issue indefinitely) nor a purely manual
process with no automated retry at all.

## Decision

Pre-flight validation failures (illegal file name, oversized file) are
**not retryable** and go straight to `Abandoned` on first encounter — a
name or size problem will never resolve itself on retry. Genuine copy
failures increment `AttemptCount`; once it reaches the `MAX_ATTEMPTS` app
setting, status becomes `Abandoned`, otherwise `Failed` (eligible for
retry on the next poll). The only path back from `Abandoned` to
retryable is the explicit, auditable `Reset-AbandonedFiles.ps1` script —
see
[`../operations/scripts-reference.md`](../operations/scripts-reference.md).

## Alternatives considered

- **Auto-retry indefinitely (e.g. every 24h forever)** — rejected: could
  silently mask a real, permanently-broken condition.
- **Permanent manual-only, no automated retry path at all** — rejected: no
  route back to automation once a transient issue is fixed.

## Consequences

- See ADR-0019 for the error taxonomy that classifies *why* a given
  attempt failed, feeding the digest's actionable error reporting.
