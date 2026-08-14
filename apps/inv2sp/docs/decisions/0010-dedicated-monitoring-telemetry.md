# ADR-0010: Dedicated App Insights + Log Analytics per environment

**Status:** Accepted
**Date:** Phase 1

## Context

An earlier attempt to deploy `appInsights` in dev had failed — the tenant
denies classic (non-workspace-based) App Insights components by policy.
Separately, an existing policy-managed diagnostic setting already ships
only `FunctionAppLogs` + `AllMetrics` to a central SecOps workspace — it
does not capture workflow run history, and is not something this project
controls or should modify.

## Decision

Deploy a new, dedicated workspace-based App Insights instance and Log
Analytics workspace per environment (`AI-...`, `LAW-...`), always passing
a real `workspaceResourceId` (never empty). Add a **second, independent**
diagnostic setting enabling `WorkflowRuntime` logs, pointed at the new LAW
— without touching the existing policy-managed setting at all.

## Rationale

The original failure's root cause was a pure sequencing bug (an empty
`workspaceResourceId` triggers tenant policy denial of classic App
Insights), not a permissions problem — confirmed by exporting and
inspecting the original ARM template. Azure allows multiple diagnostic
settings per resource, so this sidesteps any question of rights over the
SecOps-owned workspace entirely.

## Consequences

- Verified via a `what-if` gate showing exactly 7 created resources
  (AI/LAW/diagnostics setting, as intended) with no interference with the
  pre-existing policy-managed setting.
