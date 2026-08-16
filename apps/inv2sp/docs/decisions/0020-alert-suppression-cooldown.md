# ADR-0020: Alert suppression — state-transition + cooldown

**Status:** Accepted, reconfirmed 2026-08 with live evidence
**Date:** Phase 2, reconfirmed 2026-08

## Context

Alerting on every run that contains any failure could produce up to ~96
emails/day during a sustained outage (the scheduled poll runs every 15
minutes).

## Decision

Alerts fire only on state **transitions**: the first failure of a
previously-healthy file, or any new abandonment — not on repeat failures
of an already-known issue. Abandoned files **always** alert regardless of
cooldown (each is a distinct, always-actionable event, already
de-duplicated per-file by the transition check). A 60-minute cooldown
(`ALERT_COOLDOWN_MINUTES`) applies only to the "newly failed" case, to
protect against a sustained systemic outage (e.g. gateway down)
re-alerting every 15 minutes for what is really one ongoing issue.

## Alternatives considered

- **Alert on every run with any failure present** — rejected, would
  produce alert fatigue during any sustained issue.

## Rationale / evidence

Reconfirmed correct with live evidence: an actual empty-folder run showed
`Should_Send_Immediate_Alert` correctly evaluating to false and
`Send_Alert_Email` genuinely `Skipped` — matching the intended design
exactly. No code change was needed when this was re-verified.

## Consequences

- See ADR-0021 for the separate, run-level dead-man's-switch threshold
  (a different mechanism, for total silence rather than in-workflow
  failure reporting).
