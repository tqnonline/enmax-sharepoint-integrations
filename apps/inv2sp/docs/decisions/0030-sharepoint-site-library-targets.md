# ADR-0030: SharePoint site/library targets (dev/prod)

**Status:** Accepted for dev — **prod path unconfirmed, do not assume**
**Date:** Phase 0/1, corrected 2026-08 (dev only)

## Context

Need concrete SharePoint destination targets for both environments.

## Original decision

Dev site `https://enmaxcorp.sharepoint.com/sites/AP`, target folder `AP`
inside the `Shared Documents` library. Production: same site, a dedicated
"Accounts Payable" library at `/sites/AP/P`. Content type `Enmax Document`
(`0x010100C5939496BD3E0F4287FA702FBCF7C0BE`) for both environments — see
ADR-0024 for why content-type stamping is no longer functionally active
regardless.

## Correction (dev only)

The dev target folder was later corrected: the user clarified dev's
target should be the `Shared Documents` library **root**, not an `AP`
subfolder. `infra/params/dev.bicepparam`'s `sharePointTargetFolder` is now
`/Shared Documents`.

## ⚠️ Open item — production target unconfirmed

**The exact production folder path was never successfully confirmed.** A
message specifying it was garbled in transit and was never successfully
resent. **Do not deploy or document production against the original
`/sites/AP/P` "Accounts Payable" assumption without re-confirming this
directly with the business owner first.** This is the single most
important open item blocking a safe production rollout — see
[`../operations/known-issues.md`](../operations/known-issues.md).

## Consequences

- The content-type identifier itself (`0x0101...`) was independently
  reconfirmed correct via a name round-trip check before content-type
  patching was abandoned entirely (ADR-0024) — the identifier was never
  wrong, the SharePoint-side library configuration prerequisite for
  patching it was the blocker.
