# ADR-0013: Recipient/config management via Key Vault secret

**Status:** Accepted
**Date:** Phase 2 planning

## Context

Alert and digest recipient lists need to be editable without a redeploy.

## Decision

Store recipient lists as Key Vault secrets (semicolon-separated, matching
the O365 connector's native `To` field format directly — no splitting
needed anywhere consumed as an email recipient list). Read at runtime via
the Key Vault connector + managed identity, inside the workflow itself.

## Alternatives considered

- **Plain app-setting Key Vault reference** (`@Microsoft.KeyVault(...)`)
  — rejected: app-setting Key Vault references are cached for roughly 24
  hours by the platform, which defeats the "must be editable without
  redeploy, and take effect promptly" requirement.

## Consequences

- Only `Deploy-Infrastructure.ps1`'s own parsing of the recipient string
  into the Action Group's `emailReceivers` array needs to split on `;` —
  every other consumer (the workflows themselves) passes the
  semicolon-separated string straight through to the connector unchanged.
