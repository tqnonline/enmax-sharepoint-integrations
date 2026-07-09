# ADR 0002 - Per-document (sheet-level) check-in / checkout

- Status: Accepted
- Date: 2026-07-08
- Amends: [ADR 0001](0001-document-numbering-model.md) (Standard Document singleton sheet — see § Amendment)
- Plan: per-document checkout epic

## Context

Check-in and checkout today operate on the **drawing** (`enmax_autocaddrawing`): one checkout row per base, state bulk-propagated to all child sheets, audit events keyed to the drawing. The business requires the **actionable unit** to be the individual document (`enmax_autocadsheet`) — e.g. `DE-9A-00-AES-AAA-AC-0017-001` for Drawing Documents and Procedure Form Documents, and the base number alone for Standard Documents (no `-sss` suffix in display or PDF name).

Sheets already carry `enmax_acdnstate`, SharePoint URLs, and denormalized taxonomy. Checkout does not yet link to a sheet.

## Decision

1. **Unified document model.** Every check-in, check-out, approval queue row, and My Reservations Available/Checked Out row targets `enmax_autocadsheet`. The parent drawing is a **grouping** record only; its lifecycle state is **derived**, never set directly by checkout/check-in plugins.

2. **Display numbers.**
   - Drawing / Procedure child: `{base}-{NNN}` (3-digit sheet index).
   - Standard singleton: `{base}` only (expected PDF `{base}.pdf`).

3. **Standard singleton sheet (amends ADR 0001).** ADR 0001 stated Standard has no children. Implementation adds **exactly one** `enmax_autocadsheet` per Standard base at issuance — internal document carrier for checkout/check-in/audit. Issued reservation numbers remain base-only (no `-sss`). `enmax_acdnsheetnumber` is `null` or `0` (implementation uses `null`; migration uses the same). `enmax_acdnsheetcount` on the drawing is `1`.

4. **Checkout schema.** `enmax_autocadcheckout` gains lookup `enmax_acdnsheet` (required for new checkouts), optional `enmax_acdnbatchid` for bulk actions, alt key for one-open-checkout-per-sheet. `enmax_acdndrawing` remains populated as denormalized parent for rollup queries.

5. **API.** New custom API `enmax_acdnCheckOutSheets` accepts sheet id(s) or drawing + `AllAvailable`. Drawing-only checkout is deprecated; all types including Standard go through sheets.

6. **State machine on sheet.** Available → CheckoutRequested → CheckedOut → AwaitingValidation → Available (or back to CheckedOut on decline). Same optionset values as today on `enmax_acdn_sheetstate`.

7. **Drawing rollup.** After every sheet transition, recompute drawing state:
   - Any sheet CheckedOut → drawing CheckedOut
   - Else any AwaitingValidation → drawing AwaitingValidation
   - Else all sheets share a terminal state → that terminal
   - Else Available  
   Rollup runs in the same serialized update as the sheet change (`IfRowVersionMatches` on drawing).

8. **Audit subject.** Check-in/check-out audit events use `enmax_acdnsubjecttable = enmax_autocadsheet`, `enmax_acdnsubjectid = sheetId`. Terminal lifecycle (Finalize, MarkObsolete, Release) may remain drawing-keyed with cascade to all sheets — documented here, not migrated historically.

9. **App Config.** Six `Enable*Checkout` / `Enable*CheckIn` keys gate availability per taxonomy (default true). `MaxRecordsPerReservation` (renamed from `MaxDrawingsPerReservation`) caps base count per reservation for all types including Standard ranges.

10. **Migration (DEV).** Backfill sheet state where null; create singleton sheet for existing Standard bases without sheets; convert or force-close in-flight drawing-level checkouts to per-sheet rows. Historical audit rows are not rewritten.

## Amendment to ADR 0001

- **Decision 1 (Standard):** UX/reserve wizard still shows Standard as `createsChildren: false`. At issuance, plugins create base + **one singleton sheet** (no `-sss` in issued numbers).
- **Decision 6:** `enmax_autocadsheet` is now also the document carrier for Standard (singleton), not only Drawing Documents and Procedure Form Documents.

## Consequences

- One code path for checkout, check-in, approvals, grids, and audit across Drawing, Procedure, and Standard.
- Search may remain base-level for discovery; My Reservations and Approvals list **documents** (sheets).
- Existing drawing-keyed audit remains readable; new events are sheet-keyed.
- Schema and plugin changes require migration before enabling per-sheet UI in production.

## Alternatives considered

- **Drawing-level checkout with sheet selection in UI only:** rejected — state and audit would still be inconsistent under partial checkout.
- **Separate Standard document entity:** rejected — duplicates checkout/audit paths; ADR 0001 already maps Standard onto `enmax_autocaddrawing`.
