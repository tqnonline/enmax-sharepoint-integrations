# Plan #06 — Check-Out, Check-In, Revision + SharePoint Provisioning

**Date:** 2026-05-17
**Owner:** Engineering (Claude Code agent + one human reviewer: Rahul Akmol)
**Spec:** `2026-05-17-phase-1-cut-line-spec.md`
**PRD refs:** sections 5.3 (journey), 7.2 (state machines), 8 (SharePoint arch), 10 (flows), 11 (notification UX), 12.4 (custom actions), 27 (glossary states)
**Decisions:** `2026-05-17-open-questions-decision-memo.md`
**Estimated effort:** 18–22 hours (SharePoint provisioning + indexing is the long pole)
**Branch:** `feat/006-checkout-checkin-revision` → PR to `dev`
**Blocked by:**
- Plans #01–#05 merged to `dev`
- Runbook #004 executed: Generation Drawings site collection exists at `https://enmax.sharepoint.com/sites/GenerationDrawings`
- Runbook #005 executed: `Generation Drawing Information` content type bound to site; `Systems` + `Vendors` term sets exist
- Service account has **`Sites.Selected` FullControl** on the Generation Drawings site (per Q3 re-decision 2026-05-18 post architecture review Finding 5.1). Override of original READ-only scope. Risk acknowledged: compromised credential = full SP write blast radius. Mitigated by Key Vault + quarterly rotation + per-flow audit events.

## Context

This plan covers the entire post-reservation life cycle: how a Drawing moves from `Available` → `CheckedOut` → `AwaitingValidation` → `CheckedIn` and back to `Available` at a bumped revision. It also ships the SharePoint provisioning flow that creates one document library per Asset-Unit combination, the indexing flow that captures Sheet URLs after the user uploads PDFs, the stale-checkout reminder scheduler, and the admin force-checkin override.

After this plan merges, an end user can take an approved Drawing through a full revision cycle: check out → upload PDFs directly to SharePoint → submit revision in app → approver validates → Drawing is CheckedIn with bumped revision. Admins can force a checkout closed when a user is unavailable. Scheduled reminders ping users at 3, 6, and 12 months.

This plan does **not** ship: Search (plan #07), My Items grid (plan #07), full Reference Data editor (plan #07), broadcast UI (plan #08). The check-out / revision action components are built as reusable React components in `src/features/checkout/components/` so plan #07 can host them in the real Search side panel.

## Prerequisites

- Plans #01–#05 merged
- IssueNumbers plug-in (plan #03) deployed; concurrency test passing
- Reservation flow (plan #05) produces Drawing + Sheet rows in `Available` / `PendingInitialUpload` states
- App Configuration has `StaleCheckoutMonths` = `3,6,12` per plan #02 Step 9
- Service account credential in Azure Key Vault with **`Sites.Selected` FullControl** scope granted on Generation Drawings site collection (per Q3 re-decision)
- Test users seeded in 3 Entra groups; at least one Drawing exists in dev tenant via plan #05 smoke

## Out of Scope for This Plan

- Search grid (plan #07) — the Drawing side panel ships as a reusable component; the Search host ships separately
- My Items full grid (plan #07) — plan #06 enhances the My Items placeholder with a minimal "My Checked-Out Drawings" list to exercise the action components; plan #07 replaces with full grid
- Reference Data editor for Asset-Unit (plan #07) — Asset-Unit activation here is triggered by the existing reference data; the activation UI lives in #07
- Broadcasts (plan #08)
- Per-sheet check-out (Phase 2; PRD section 7.2 Sheet table comment "supports future per-sheet semantics" — Phase 1 is drawing-level only)
- File locking on the file share (cut-line spec — out of scope permanently)
- Automated file renaming on user upload (cut-line spec — service account read-only, can't rename)

## Custom Actions to Author (Step 1)

Three new bound custom actions, plus one for force-checkin. All authored in maker UI per plan #02 discipline; export + unpack + commit.

### 1.1 `enmax_acdnCheckOutDrawing` (bound to Drawing)

Per PRD section 12.4: end users check out drawings via custom action (not direct Create on Checkout) so the platform enforces preconditions.

| Property | Value |
|----------|-------|
| Binding | Entity (`enmax_autocaddrawing`) |
| Is function | No |
| Inputs | (none beyond the bound row) |
| Outputs | `CheckoutId` (String) |

**Flow implementation:** deferred to **Plan #11 Step B1**.

### 1.2 `enmax_acdnApproveCheckin` (bound to Checkout)

| Property | Value |
|----------|-------|
| Binding | Entity (`enmax_autocadcheckout`) |
| Inputs | `Decision` (OptionSet: Approved/Declined), `Reason` (String, required when Declined) |
| Outputs | `CheckoutId`, `NewStatus`, `DrawingState` |

**Flow implementation:** deferred to **Plan #11 Step B2**.

### 1.3 `enmax_acdnForceCheckin` (bound to Checkout)

| Property | Value |
|----------|-------|
| Binding | Entity (`enmax_autocadcheckout`) |
| Inputs | `Reason` (String, required) |
| Outputs | `CheckoutId`, `DrawingState` |

**Flow implementation:** deferred to **Plan #11 Step B3**.

### 1.4 Submit Revision (NO custom action — direct Checkout update)

Per PRD section 5.3, the user updates their own Checkout row directly. Owner of Checkout = user who checked out (per PRD section 12.5). Dataverse permission lets owner update.

Submit-revision form writes:
- `Status` → AwaitingValidation (2)
- `NewRevision` → user-typed (e.g. "B", "02")
- `NewPDFUrls` → empty (filled by indexing flow in Step 3)

The `On Revision Submitted` flow (Step 3) triggers from that Checkout row update.

**Audit event emission (per architecture review 2026-05-18 Anti-Pattern #5):** the `AuditEmitter` C# plug-in (authored in plan #07 Step 4b) is registered on Checkout Update PostOperation. On the Open→AwaitingValidation status transition, it writes an Audit Event with `Event=StateChanged`, `From=Open`, `To=AwaitingValidation`, `ActedBy=callingUser`. Plug-in registration listed in plan #07 Step 4b's registered-steps table.

## Steps 2–8 — Deferred to Plan #11

All Power Automate flow work has been moved to **Plan #11 — Power Automate Flows** (`2026-05-20-plan-11-power-automate-flows.md`):

| Original step | Plan #11 section | Description |
|---|---|---|
| Step 2 | B4 | Flow `On Asset-Unit Activated → Provision SharePoint Library` |
| Step 3 | B5 | Flow `On Revision Submitted → Index SharePoint and Notify Approvers` |
| Step 4 | B6 | Flow `On Checkin Approved → Finalise Drawing` |
| Step 5 | B7 | Flow `On Checkin Declined → Revert to Checked Out` |
| Step 6 | B8 | Child flows `Send_Validation_Needed_Email` + `Send_Validation_Result_Email` |
| Step 7 | B9 | Flow `On Force Checkin → Admin Override` |
| Step 8 | B10 | Flow `Stale Checkout Reminder` (scheduled) |

Flow development is deferred until non-flow work from Plans #05–#10 is merged.

## Step 9 — UI Components (Code App)

**File tree:**

```
src/features/checkout/
├── components/
│   ├── DrawingActionsPanel.tsx       # Wraps CheckOutButton / SubmitRevisionDrawer based on state
│   ├── CheckOutButton.tsx            # Single-click → calls enmax_acdnCheckOutDrawing
│   ├── SubmitRevisionDrawer.tsx      # Form: new revision + confirm-files-uploaded checkbox
│   ├── ValidationDrawer.tsx          # Admin/approver: review submitted revision; Approve / Decline
│   └── ForceCheckInDialog.tsx        # Admin-only: typed reason → enmax_acdnForceCheckin
├── hooks/
│   ├── useCheckOut.ts
│   ├── useSubmitRevision.ts
│   ├── useApproveCheckin.ts
│   └── useForceCheckin.ts
└── api/
    └── checkoutClient.ts             # Dataverse Web API wrappers for the 4 mutations
```

**Where used:** plan #07 hosts these inside Search side panel; plan #06 hosts them in an enhanced My Items placeholder ("My Checked-Out Drawings" — minimal list, action buttons).

**DrawingActionsPanel logic:**

```typescript
function DrawingActionsPanel({ drawing, openCheckout }: Props) {
  const { role } = useUserRole();
  if (drawing.state === "Available") {
    return <CheckOutButton drawingId={drawing.id} />;
  }
  if (drawing.state === "CheckedOut" && openCheckout?.checkedOutBy === currentUser.id) {
    return <SubmitRevisionDrawer checkoutId={openCheckout.id} />;
  }
  if (drawing.state === "AwaitingValidation" && (role === "Approver" || role === "Admin")) {
    return <ValidationDrawer checkoutId={openCheckout!.id} />;
  }
  if (drawing.state === "CheckedOut" && role === "Admin") {
    return <ForceCheckInDialog checkoutId={openCheckout!.id} />;
  }
  return <ReadOnlyStateLabel drawing={drawing} openCheckout={openCheckout} />;
}
```

**SubmitRevisionDrawer form:**

- `newRevision` (text, required, defaults to "next" — e.g. if current is "A", default is "B"; if "01", default is "02")
- `filesConfirmed` (checkbox, required) — labelled "I have uploaded the revised PDFs to the SharePoint library at: `{libraryUrl}`"
- Submit → direct Dataverse PATCH on Checkout row (no custom action; owner has Update privilege per PRD section 12.5)

**ValidationDrawer:**

- Shows captured `NewPDFUrls` as clickable links (open in new tab; SharePoint hosts)
- Shows any missing sheets (red banner)
- Shows requester's `newRevision`
- Approve button → calls `useApproveCheckin({decision: "Approved"})`
- Decline button → opens reason dialog (min 10 chars) → calls action w/ Declined

## Step 10 — Tests

**Code App component tests (Vitest + RTL):**

| # | Test | Asserts |
|---|------|---------|
| 1 | CheckOutButton visible only when Drawing.state=Available | |
| 2 | CheckOutButton calls action + invalidates queries on success | MSW mock |
| 3 | SubmitRevisionDrawer visible only to Checkout owner | |
| 4 | SubmitRevisionDrawer requires filesConfirmed checkbox | |
| 5 | SubmitRevisionDrawer suggests next revision letter | A→B |
| 6 | SubmitRevisionDrawer suggests next revision number | 01→02 |
| 7 | ValidationDrawer visible to Approver/Admin when AwaitingValidation | |
| 8 | ValidationDrawer hides Approve when missing sheets present (defensive) | |
| 9 | ForceCheckInDialog visible to Admin only | |
| 10 | ForceCheckInDialog requires reason min 10 chars | |
| 11 | DrawingActionsPanel returns ReadOnlyStateLabel when no actions available | E.g. Available but viewer not allowed |

**Integration tests (flow-dependent):** moved to Plan #11 Tests section (tests 7–15). Run after flows are deployed.

**SharePoint provisioning smoke** (manual, runbook #004 verifies — can be done independently of flow deployment):
- Create new Asset-Unit row → library appears at `{site}/BB-AA-UU` within 60s
- Content type bound; versioning enabled; minor versions disabled
- Three Entra groups have Read

## Verification — End-to-End Checklist

```powershell
# Code App tests
Set-Location apps/code-app
npm test -- src/features/checkout         # all 11 component tests pass

# Build + push
npm run build
npx power-apps push --environmentId $env:DEV_POWER_APPS_ENV_ID

# CI verification
git push -u origin feat/006-checkout-checkin-revision
gh pr create --base dev --title "feat(checkout): checkout/checkin UI components + custom action defs per plan #06"
gh pr checks                                          # ci.yml green
```

**Acceptance:**
- All 11 Code App component tests pass
- DrawingActionsPanel renders correct action buttons per Drawing state + user role
- Custom action API definitions (CheckOutDrawing, ApproveCheckin, ForceCheckin) authored in maker and exported
- Plug-in concurrency test still passes (regression)
- PR reviewed by Rahul, squash-merged to `dev`

**Note:** Full end-to-end smoke (SP provisioning, revision indexing, checkin approval, stale reminders) requires flows from Plan #11 to be deployed first.

## Critical Files to Read Before Starting

| File | Why |
|------|-----|
| PRD sections 5.3, 7.2, 8, 10, 11, 12.4, 27 | Authoritative journey + state machine + SP arch + notification |
| `2026-05-17-plan-05-reservation-flow.md` | Notification fan-out pattern to mirror; child flow architecture |
| `2026-05-17-plan-02-dataverse-schema-and-seed.md` Step 5 | Checkout alternate key `(Drawing, Status)` — race-protection foundation |
| Runbook #004 `runbooks/004-sharepoint-site-and-library-creation.md` | Site collection setup; service account permission grants |
| Runbook #005 `runbooks/005-content-type-and-term-set-binding.md` | Content type ID + column set |
| [MS Learn: SharePoint REST API for Sites.Selected](https://learn.microsoft.com/en-us/sharepoint/dev/solution-guidance/security-apponly-azuread) | Service account auth + scoping |

## Downstream Plans Unblocked by This Plan

| Plan | Unblocked? | Why |
|------|------------|-----|
| #07 Search + admin surfaces | Yes | DrawingActionsPanel component ready to drop into Search side panel; My Items has real CheckedOut data to display |
| #08 Broadcast + notifications | Partial | Bell panel can now show stale-reminder notifications + checkout state-change notifications in addition to plan #05 reservation events |
| #09 UAT promotion | Yes | All workflow features feature-complete after #06; remaining work is search/admin/broadcast/UAT promotion |

## Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| SharePoint provisioning flow fails mid-execution (e.g. content type binding succeeds but permission grant fails) | Library URL written ONLY at flow end (Step 2 step 8); failed provisioning leaves Asset-Unit URL null; admin sees red dot in Reference Data; manual rerun via maker Run-now after fixing |
| SP REST API rate limit (300 req/min per app per tenant) | Provisioning is one-time per Asset-Unit; indexing is one query per Submit Revision (small payload). Far below limit. |
| Two users race on Submit Revision for same Checkout | Submit Revision = direct update on Checkout row; Dataverse optimistic concurrency token rejects second write w/ ConcurrencyVersionMismatch; user sees friendly retry message |
| Drawing.state two-transition pattern (CheckedIn → Available in Step 4) confuses readers | Documented explicitly in Step 4 with rationale; audit log captures both; non-load-bearing for downstream (Search treats Available + CheckedIn equivalently in Phase 1) |
| User uploads PDF with wrong filename (e.g. typo in segment) | Indexing flow doesn't match → reports missing sheet; user re-uploads w/ correct name (SP allows rename via Edit properties); doesn't break the flow, just delays validation |
| User checks out Drawing, leaves company, no one knows | Stale reminders escalate to admin in 3/6/12 month buckets; admin force-checks-in with audit reason |
| SharePoint library missing for newly-approved Reservation's Asset-Unit | Plan #05 Step 5 already guards: if SP library URL null, Reservation reverts to Pending w/ admin notification. Resolved by running provisioning flow first. |
| Service account loses Sites.Selected FullControl during quarterly secret rotation | ~~Synthetic monitor flow runs hourly per PRD risk #2 mitigation~~ — **synthetic monitor deprioritised per project decision 2026-05-18 (Finding 5.14)**; permission regression detected reactively when next provisioning or indexing flow throws 403. Runbook #009 re-grant procedure. Quarterly rotation rehearsal in plan #09 partially mitigates. |
| Compromised service-account credential w/ FullControl SP grant (Finding 5.1 trade-off) | Key Vault storage + quarterly rotation + per-flow Audit Event captures every SP write + service account excluded from notification recipient lists. **Increased blast radius accepted per project decision 2026-05-18.** |
| `MissingSheets` flag column not in plan #02 schema | TODO below; add via maker UI export-unpack-commit; column is single Yes/No or JSON list of missing sheet numbers |
| Force-checkin discards user's in-flight revision URLs | Acceptable per Force Checkin = Admin Override semantics; user is offline / unavailable so re-upload is irrelevant. If admin needs to preserve the URLs, they Approve the checkin instead. |

## TODOs Left in This Plan

- **Add `MissingSheets` column to Drawing table** (plan #02 Step 4 addition). Author via maker UI; export+unpack+commit. Single line addition to the schema.
- **Verify library code includes Business prefix** — PRD section 8.2 example `GG-CG-01` suggests yes (3-segment); plan documents this assumption. Confirm by reading the canonical Asset-Unit naming source.
- **Mountain Time DST handling** — scheduled flow at 06:00 MT shifts twice yearly. Power Automate recurrence handles DST natively; confirm during first scheduled-trigger test (mid-March or early November).
- **Synthetic monitor flow for SP service-account permission health** — referenced in plan but not authored here. Small follow-up plan; one-flow effort.
- **Force-checkin notification copy** — Step 7 sends notification to original CheckedOutBy user w/ admin's reason; copy should be sensitive ("Your check-out was force-closed by an administrator; the recorded reason is: {{reason}}. Contact {{admin}} for details."). Finalise template in Step 8 implementation.
