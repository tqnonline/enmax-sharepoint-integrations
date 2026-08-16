# ADR-0002: Email transport — O365 Outlook connector, delegated auth

**Status:** Accepted
**Date:** Phase 2 planning

## Context

The integration needs to send two kinds of email: immediate failure alerts
(technical audience) and daily/on-demand digests (finance/accounting
audience).

## Decision

Use the Office 365 Outlook connector with delegated OAuth authentication
via a dedicated service-account mailbox, for both alert and digest email.

## Alternatives considered

- **Microsoft Graph API + Managed Identity** — more automatable and doesn't
  depend on an interactive OAuth consent that can expire — but not chosen;
  operational uniformity with the delegated consent model used elsewhere
  (see ADR-0008) was preferred.
- **SMTP + Key Vault credential** — likely blocked by tenant basic-auth
  restrictions; rejected.
- **Azure Communication Services Email** — would require a new resource
  and would not send from an `@enmax.com` address; rejected.

## Consequences

- **Accepted risk:** delegated OAuth consent for the service account can
  silently break on password rotation or a Conditional Access policy
  change, with no in-workflow indication. Mitigated by a daily connection
  health check (`Test-Connections.ps1`) plus the independent Azure Monitor
  layer (ADR-0011), which does not depend on this connector at all.
- All alert and digest sends go through the `office365` connection —
  see ADR-0004 for why this connection specifically had to be recreated
  as a V2-kind connection.
