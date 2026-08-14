# ADR-0029: Two separate service-account identities

**Status:** Accepted, reaffirmed
**Date:** Phase 0/1

## Context

The integration touches two genuinely different systems requiring
credentials: the on-premises file share (Windows/gateway auth) and
SharePoint + email (Microsoft 365 delegated OAuth).

## Decision

Two separate service-account identities: a `CPT_*_LogicApp_sv[c]`-style
account for the on-premises file share, and a separate, new,
mail-enabled M365 account for SharePoint and email.

## Rationale

Reaffirmed unchanged even after discovering the existing file-share
service account already has dormant Exchange mailbox history that could
have been reused to simplify provisioning a single combined account — the
user confirmed the split-account model remained the intended design
regardless.

## Consequences

- See ADR-0002 and ADR-0008 for how each identity is actually used
  (delegated OAuth connectors for email/SharePoint; on-premises
  gateway auth for the file share).
