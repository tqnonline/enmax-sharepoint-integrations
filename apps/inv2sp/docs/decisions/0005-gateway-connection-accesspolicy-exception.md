# ADR-0005: Gateway-linked connection accessPolicy exception

**Status:** Accepted
**Date:** 2026-08 (Phase 3/4 real deployment)

## Context

After ADR-0004's fix, granting an accessPolicy against `filesystem-2` (the
adopted, gateway-linked File System connection) hung for 8-20+ minutes
across 3 separate real deployment attempts, each ending in
`InternalServerError` — reproduced consistently, not a transient blip, and
distinct from the non-gateway connectors which succeeded without issue.

## Decision

The `fileSystemAccessPolicy` module in `main.bicep` now only runs when
`fileSystemConnectionMode == 'create'`. Adopted connections
(`fileSystemConnectionMode == 'adopt'`, i.e. dev's `filesystem-2`) skip
accessPolicy management entirely.

## Rationale

Direct REST inspection of the live connection confirmed `filesystem-2`
**already had** a working accessPolicy grant for the current managed
identity, under a differently-named resource created by an earlier
out-of-band/portal grant. The functional requirement (the identity can
authenticate through this connection) was already satisfied — the
redundant grant attempt was failing specifically on this gateway-linked
connection type, for no functional gain.

## Consequences

- Each stuck deployment during investigation required an explicit
  `az deployment group cancel` **by the nested deployment's own name** —
  cancelling the parent deployment does not cascade to in-flight nested
  deployments (a real, non-obvious ARM behavior — see
  [`../operations/runbook.md`](../operations/runbook.md)).
- Production's equivalent connection (`fileSystemConnectionMode ==
  'create'`) does go through the full accessPolicy grant, since it is a
  fresh connection with no prior out-of-band grant.
