# ADR-0011: Three-layer monitoring architecture

**Status:** Accepted, later refined by ADR-0012
**Date:** Phase 1/2

## Context

Explicit requirement: "robust monitoring, error handling ... if anything
fails we need to send it immediately," including detection of *total
silence* — a dead workflow cannot alert on its own failure.

## Decision

Three independent layers:

1. **In-workflow** — retry/catch logic and an error taxonomy (ADR-0019)
   inside `wf-copy-invoices` itself.
2. **State tables** — `ProcessedFiles`/`RunLog`/`AlertState` (and later
   `FileRunEvents`, ADR-0023) give a durable, queryable record independent
   of any single run's outcome.
3. **Platform-level Azure Monitor alerting**, independent of workflow
   logic entirely: a dead-man's-switch (no successful run within a
   threshold window — ADR-0021), trigger-failure and run-failure rate
   alerts, and a daily connection-health check — all routed through a
   single Action Group, email only.

## Alternatives considered

- **Rely on workflow-level alerting alone** — rejected: a dead Logic App
  sends no email, by definition.
- **Teams webhook / ITSM ticketing integration** — not requested; noted as
  a future extension point only, not built.

## Rationale / evidence

The metric names originally drafted for the platform-level alerts
(`RunsSucceeded`, `TriggersFailed`, `RunsFailed`) are **Consumption Logic
App** metric conventions and do not exist on `Microsoft.Web/sites`
(Standard). This was caught by a correctness review and confirmed against
ground truth (`az monitor metrics list-definitions` on the live resource)
before shipping — the real names are `WorkflowRunsCompleted`,
`WorkflowTriggersCompleted`, `WorkflowRunsFailureRate`,
`WorkflowTriggersFailureRate`. Had this shipped uncaught, the entire
platform alerting layer would have silently evaluated "no data" forever —
flagged as the single most consequential Phase 1 review finding.

## Consequences

- See ADR-0012 for a later refinement (splitting alerts by workflow name).
