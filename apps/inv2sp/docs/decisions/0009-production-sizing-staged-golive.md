# ADR-0009: Production plan sizing and staged go-live

**Status:** Accepted (go-live mechanism superseded — see ADR-0016)
**Date:** Phase 2 planning

## Context

Need a production App Service plan sized appropriately, and a safe way to
bring the integration live without immediately moving real invoices.

## Decision

WS2 plan, capacity 1, for production. Deploy with triggers **disabled**;
enable only via an explicit script after post-deployment validation.

## Alternatives considered

- **WS1 (dev parity)** — rejected, insufficient headroom for production
  load.
- **Capacity 2** — rejected; buys availability, not throughput, and the
  engine's own concurrency is fixed at 1 run at a time regardless of plan
  capacity.
- **Fully enabled at deploy time** — rejected; real invoices would start
  moving immediately with no validation window.

## Consequences

- The WS2/capacity-1 sizing decision stands unchanged.
- The originally assumed **mechanism** for "deploy disabled, enable later"
  (the platform's native per-workflow enable/disable API) was later found
  completely non-functional and replaced by an app-setting kill-switch —
  see ADR-0016 and
  [`../operations/runbook.md`](../operations/runbook.md) for the full
  story and the working mechanism.
