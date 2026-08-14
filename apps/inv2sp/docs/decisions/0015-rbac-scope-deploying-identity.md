# ADR-0015: RBAC scope for the deploying identity

**Status:** Accepted (standing access request)
**Date:** Phase 1

## Context

Storage/Key Vault hardening (public network access disabled, no plaintext
credentials committed anywhere) requires the deploying identity to hold
role-assignment rights beyond plain Contributor.

## Decision

Request **RBAC Administrator** (deliberately not the broader User Access
Administrator) scoped to both resource groups, plus narrowly-scoped custom
roles: `INV2SP-Subnet-Join` (subnet join only), `INV2SP-Gateway-Join`
(gateway join only), Private DNS Zone Contributor, and Key Vault Secrets
Officer.

## Alternatives considered

- **User Access Administrator** — rejected: broader than needed for a
  scoped role-assignment task, harder to get approved.
- **Full Network Contributor for subnet join** — rejected in favor of the
  narrower custom role; least-privilege preferred.

## Rationale

A detailed access-gap analysis confirmed plain Contributor is sufficient
for everything **except** subnet join, gateway join, and prod role
assignments for the Logic App's managed identity — all three are covered
by this specific, narrow request rather than a broad administrative grant.

## Consequences

- The actual RBAC grant to the managed identity itself, once role
  assignment rights exist, is **Storage Table Data Contributor only** on
  the storage account (see `infra/modules/rbac.bicep`) — an earlier,
  broader set (Storage Blob Data Owner, Queue Data Contributor, Storage
  Account Contributor, Monitoring Metrics Publisher) was found to be
  unused speculative over-grant and trimmed. Similarly, the Key Vault
  access policy for the managed identity is `get` only (not `get`+`list`).
  **Do not treat any documentation implying a broader role set as
  current** — verify against `infra/modules/rbac.bicep` and
  `infra/modules/keyVaultAccessPolicy.bicep` directly.
