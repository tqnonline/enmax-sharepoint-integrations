# ADR-0012: Alert dimension splitting by workflowName

**Status:** Accepted
**Date:** 2026-08-11

## Context

A real fired native Azure Monitor alert email (fixed Microsoft template,
not restyleable) named neither the failing workflow nor the failing
action. The user asked for it to be more actionable.

## Decision

Add a `dimensions: [{name: 'workflowName', operator: 'Include', values:
['*']}]` block to both `triggerFailuresAlert` and `runFailuresAlert` in
`monitoring.bicep`. This is Azure Monitor's standard "alert per dimension
value" pattern — a wildcard dimension value causes one alert instance to
fire per distinct value actually seen, so the notification names the
specific workflow directly. The dead-man's-switch alert is deliberately
**left unsplit** (site-wide) — it checks "has *any* workflow succeeded",
and splitting it per-workflow would change its semantics into a
materially broader per-workflow check, outside the scope of this request.

## Alternatives considered

- **A new Action-Group webhook target workflow** that receives the alert,
  best-effort looks up the most recent failed run, and sends a fully
  ENMAX-branded email matching the digest template — presented as the
  higher-effort option; not chosen (deferred as a future enhancement if
  ever needed).

## Rationale / evidence

Feasibility was checked before committing to an approach:
`az monitor metrics list-definitions` confirmed `workflowName` is a valid
dimension on both failure-rate metrics, but **no per-action dimension
exists at all** on these site-level metrics — "which action failed" is
fundamentally unavailable via native metric alerts (only via run history,
which isn't exposed at alert-fire time).

## Consequences

- A real Bicep escaping bug was caught in the process: `''` (doubled
  single-quote) does not work for escaping an apostrophe in this
  codebase's Bicep convention — the working convention is `\'`.
- Verified live: `what-if` showed exactly the 2-alert diff expected, and a
  direct `az resource show` on the deployed alert confirmed the
  `workflowName` dimension is genuinely present, not just in template
  source.
