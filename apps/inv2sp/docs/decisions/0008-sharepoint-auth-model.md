# ADR-0008: SharePoint auth model — delegated OAuth, service accounts

**Status:** Accepted
**Date:** Phase 2 planning, reaffirmed Phase 0/1

## Context

Need a SharePoint access model consistent with the email transport
decision (ADR-0002) and with operational expectations for how permissions
get granted and rotated.

## Decision

Delegated OAuth via a service account, using the same operational pattern
as email. Two separate service-account identities exist overall (see
ADR-0029 for the full split): one for on-premises file-share/gateway auth,
one (a new M365 mail-enabled account) for SharePoint + email. SharePoint
Contribute access is granted directly by the requesting user at the site
level, removing SharePoint Admin from the permission-granting loop.

## Alternatives considered

- **Service principal with `Sites.Selected` Graph permission** — fully
  automatable, no interactive consent dependency, but rejected in favor of
  operational uniformity with the O365 delegated-consent model already
  chosen for email.
- **Single account for both file-share and SharePoint/email** — rejected;
  the user confirmed the split-account model, even after discovering the
  existing file-share service account has dormant Exchange history that
  could have simplified consolidation.

## Consequences

- Same accepted risk profile as ADR-0002: delegated consent can silently
  break on credential rotation or Conditional Access changes, mitigated by
  the same daily health check + independent monitoring layer.
