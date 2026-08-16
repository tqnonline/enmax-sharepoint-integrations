# ADR-0004: SharePoint/Office365 connections recreated as V2

**Status:** Accepted — supersedes part of ADR-0001
**Date:** 2026-08 (Phase 3/4 real deployment)

## Context

A real dev deployment failed both the `sharePointAccessPolicy` and
`office365AccessPolicy` nested deployments with
`InvalidApiConnectionAccessPolicy`: access policies (the mechanism that
lets a Logic App's managed identity authenticate through a connection
without embedding credentials) are unsupported on **V1**-kind connections.
The dev `office365`/`sharepointonline` connections, originally adopted
as-is per ADR-0001, were both V1.

## Decision

Delete the V1 `office365` and `sharepointonline` connections and recreate
both as **V2**. Dev's `sharePointConnectionMode` parameter changed from
`'adopt'` to `'create'` to reflect this.

## Alternatives considered

None viable — V1 connections cannot support the ManagedServiceIdentity
accessPolicy auth model at all, confirmed empirically via an isolated
throwaway V2 connection + accessPolicy test in the live dev resource group
before touching the real connections.

## Consequences

- One-time manual re-authorization required in the Azure Portal for both
  recreated connections (completed and confirmed, both authorized as
  `rakmol@enmax.com`).
- This is a **partial amendment** to ADR-0001's "adopt as-is" philosophy —
  the `filesystem-2` connection remains adopted as-is (see ADR-0005 for why
  it's handled differently); only these two connections needed
  recreation.
