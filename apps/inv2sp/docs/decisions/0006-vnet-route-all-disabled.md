# ADR-0006: `vnetRouteAllEnabled` disabled for gateway egress

**Status:** Accepted
**Date:** 2026-08 (Phase 3/4 real deployment)

## Context

Live testing of `filesystem-2` ("list files") failed with `BadRequest ...
SSL connection could not be established`. Root cause: `vnetRouteAllEnabled`
had been manually set to `true` on the live site (never Bicep-managed), a
regional-VNet-integration setting that routes **all** outbound traffic
through the VNet — including the on-premises data gateway's public Azure
Relay endpoint, which has no confirmed NAT/egress path for that traffic
through this VNet.

## Decision

Set `vnetRouteAllEnabled: false` explicitly in `logicApp.bicep`'s
`siteConfig` (previously absent from Bicep entirely, so it silently
inherited whatever was manually set on the live resource).

## Rationale

This is a well-documented Microsoft regional-VNet-integration gotcha, not
an obscure edge case. Verified live: an immediate `az webapp config set`
provided instant relief, then the fix was reconciled through a proper
Bicep redeploy, and `Test-Connections.ps1` confirmed all three connections
reported `Connected` afterward.

## Consequences

- Any future VNet-integration change to this site must account for the
  gateway's Azure Relay traffic needing to bypass VNet routing — do not
  re-enable `vnetRouteAllEnabled` without re-verifying gateway
  connectivity live.
