# ADR-0001: Adopt dev resources as-is rather than recreate

**Status:** Accepted
**Date:** 2026-07 (Phase 0/1)

## Context

Dev's resource group already contained live resources deployed manually
before this repository existed: irregular naming (`filesystem-2`/`-3` file
system connections, a Key Vault physically in `westus` despite naming/tags
implying `westus2`, non-standard `-fileshare-PE` private endpoint naming),
plus 3 live API connections that would need re-authorization if recreated,
and at least one Key Vault secret suspected to be an unconfirmed bootstrap
placeholder.

## Decision

Adopt existing dev resources **as-is**, irregular names and all. Bicep
references them by name/ID rather than recreating them. Production, which
is genuinely greenfield, gets clean naming from day one.

## Alternatives considered

- **Rebuild dev clean** — rejected: forces re-authorization of all 3 live
  connections and re-entry of an unknown file-share password, for no
  functional benefit.
- **Parallel clean-build then cutover** — rejected: doubles cost and
  complexity, not warranted for a dev/UAT/QA environment.

## Consequences

- A known, accepted region mismatch remains on the dev Key Vault
  (`westus` vs. the `westus2` implied by its name) — this causes recurring
  Azure Policy diagnostic-remediation failures. Recreating it would trigger
  a 90-day Key Vault soft-delete conflict plus full re-authorization of
  dependents, so it is accepted as a standing, surfaced risk rather than
  fixed.
- `infra/naming.bicep` and module headers under `infra/modules/` carry the
  adopt-vs-create branching logic (`fileSystemConnectionMode`,
  `sharePointConnectionMode`, etc.) required to support both dev's adopted
  topology and prod's clean one from the same templates.
- Verified in practice, not just in theory: a `what-if` deployment gate
  showed 12 dev resources correctly reported as "ignored" (Key Vault, 4
  private endpoints + NICs, `filesystem-2`/`-3`, `sharepointonline`).

## Related

- ADR-0004 (SharePoint/Office365 connections were later force-recreated
  as V2 — a partial amendment to this decision, not a full reversal).
