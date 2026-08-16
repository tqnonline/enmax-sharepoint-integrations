# ADR-0007: Networking ownership via parameterized resource IDs

**Status:** Accepted
**Date:** Phase 2 planning

## Context

Networking configuration (VNet integration, private endpoints, DNS) needs
to be reproducible across environments while accommodating dev's
adopted/irregular topology alongside prod's clean one.

## Decision

Own private endpoints and VNet/subnet/DNS zone IDs as Bicep parameters
(not hardcoded, not fully manual). Production mirrors dev's VNet
integration and 4 private endpoints via the same parameter mechanism, and
is deployed with hardened network posture (public access disabled,
firewall default-deny) from day one.

## Alternatives considered

- **Full manual configuration** — rejected: drifts from source control,
  no reproducibility.
- **Flag-gated VNet integration** — rejected as unnecessary given the
  parameterized-ID approach already achieves the same flexibility.
- **Public-first phased prod rollout, harden later** — rejected: this
  handles Confidential-classified data; hardening should not be deferred.

## Consequences

- `enableHardening` in `storage.bicep`/`keyVault.bicep` controls only
  network-level posture (public access + firewall default action) — it
  does **not** control `allowSharedKeyAccess`, which must always stay
  `true` regardless of environment (a platform constraint of the
  Functions/Workflow Standard content share, not a togglable security
  choice — see the header comment in `infra/modules/storage.bicep`).
