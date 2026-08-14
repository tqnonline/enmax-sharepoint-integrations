# ADR-0021: Dead-man's-switch threshold — PT6H

**Status:** Accepted — corrects an invalid original value
**Date:** Phase 3 (real deployment correction)

## Context

`monitoring.bicep` originally built the dead-man's-switch alert's
`windowSize` as `'PT${deadmanThresholdHours}H'` with a default of `2`,
producing `PT2H`. This is **not a legal** `Microsoft.Insights/metricAlerts`
`windowSize` value — the allowed set is
`PT1M|PT5M|PT10M|PT15M|PT30M|PT1H|PT6H|PT12H|P1D`. Caught by a real
`what-if` failure (`InvalidTemplateDeployment`), not by inspection.

## Decision

`PT6H`. The workflow runs every 15 minutes, so even a 1-hour window would
represent 4 missed cycles before firing; 6 hours trades slightly slower
detection for materially lower false-positive risk. Added an
`@allowed([1, 6, 12])` constraint on the parameter to prevent this class
of invalid-value bug from recurring.

## Alternatives considered

- 1h — rejected: too sensitive relative to the 15-minute run cadence.
- 12h/24h — rejected: too slow to detect a genuine total outage.

## Consequences

- `PT6H` is now consistent across `monitoring.bicep`, `main.bicep`, and
  both `.bicepparam` files.
