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
- Service account has `Sites.Selected` READ on the Generation Drawings site (per Q3 decision); transient Site Owner permission available during dev-tenant first provisioning run only

## Context

This plan covers the entire post-reservation life cycle: how a Drawing moves from `Available` → `CheckedOut` → `AwaitingValidation` → `CheckedIn` and back to `Available` at a bumped revision. It also ships the SharePoint provisioning flow that creates one document library per Asset-Unit combination, the indexing flow that captures Sheet URLs after the user uploads PDFs, the stale-checkout reminder scheduler, and the admin force-checkin override.

After this plan merges, an end user can take an approved Drawing through a full revision cycle: check out → upload PDFs directly to SharePoint → submit revision in app → approver validates → Drawing is CheckedIn with bumped revision. Admins can force a checkout closed when a user is unavailable. Scheduled reminders ping users at 3, 6, and 12 months.

This plan does **not** ship: Search (plan #07), My Items grid (plan #07), full Reference Data editor (plan #07), broadcast UI (plan #08). The check-out / revision action components are built as reusable React components in `src/features/checkout/components/` so plan #07 can host them in the real Search side panel.

## Prerequisites

- Plans #01–#05 merged
- IssueNumbers plug-in (plan #03) deployed; concurrency test passing
- Reservation flow (plan #05) produces Drawing + Sheet rows in `Available` / `PendingInitialUpload` states
- App Configuration has `StaleCheckoutMonths` = `3,6,12` per plan #02 Step 9
- Service account credential in Azure Key Vault with `Sites.Selected` READ scope granted on Generation Drawings site collection
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

**Implementation:** flow triggered by the action message. Steps:
1. Guard: if `Drawing.State ≠ Available`, throw with message "Drawing must be Available; current state is {{state}}"
2. Guard: if any Checkout row exists with `(Drawing = triggerRowId, Status = Open)`, throw "Drawing already checked out by {{otherUser.displayName}}"
3. Create Checkout row: `Drawing=triggerRowId`, `CheckedOutBy=callingUser`, `CheckedOutOn=utcNow()`, `Status=Open` (1), `ReminderStage=None` (0)
4. Update Drawing: `State=CheckedOut` (2)
5. Write Audit Event: `Event=StateChanged`, From=Available, To=CheckedOut, ActedBy=callingUser
6. Return new CheckoutId

**Alt-key safety:** the `(Drawing, Status)` alternate key on Checkout (plan #02 Step 5) prevents two parallel `Open` rows even if two users race. Loser's Create fails w/ duplicate-key error; flow catches and throws "Drawing already checked out".

### 1.2 `enmax_acdnApproveCheckin` (bound to Checkout)

| Property | Value |
|----------|-------|
| Binding | Entity (`enmax_autocadcheckout`) |
| Inputs | `Decision` (OptionSet: Approved/Declined), `Reason` (String, required when Declined) |
| Outputs | `CheckoutId`, `NewStatus`, `DrawingState` |

**Implementation:** flow updates Checkout.Status → ClosedApproved (3) or ClosedDeclined (4); the downstream `On Checkin Approved` / `On Checkin Declined` flows (Step 4, Step 5) fire from that update. No revision math here.

### 1.3 `enmax_acdnForceCheckin` (bound to Checkout)

| Property | Value |
|----------|-------|
| Binding | Entity (`enmax_autocadcheckout`) |
| Inputs | `Reason` (String, required) |
| Outputs | `CheckoutId`, `DrawingState` |

**Implementation:** flow updates Checkout.Status → ClosedForced (5), Drawing.State → Available (1). Admin-only via Dataverse role privilege; the action message is registered with `Privilege Required = Admin role`.

### 1.4 Submit Revision (NO custom action — direct Checkout update)

Per PRD section 5.3, the user updates their own Checkout row directly. Owner of Checkout = user who checked out (per PRD section 12.5). Dataverse permission lets owner update.

Submit-revision form writes:
- `Status` → AwaitingValidation (2)
- `NewRevision` → user-typed (e.g. "B", "02")
- `NewPDFUrls` → empty (filled by indexing flow in Step 3)

The `On Revision Submitted` flow (Step 3) triggers from that Checkout row update.

## Step 2 — Flow: `On Asset-Unit Activated → Provision SharePoint Library`

Per PRD section 8.3.

**Trigger:** Dataverse "When a row is added or modified" on `enmax_autocadassetunit`. Filter: `enmax_acdnstatus eq 1` (Active) AND `_enmax_acdnsplibraryurl_value` is null.

**Steps:**

1. **Compose library code:** `concat(Asset.Code, '-', Unit.Code)` (e.g. `CG-01`). NOTE: PRD section 8.2 says `BB-AA-UU` (3-segment) — confirm in implementation whether Business code prefix is included. Likely yes (libraries scoped by Business too). Verify by re-reading section 8.2 against existing reference data; this plan documents the choice as `concat(Business.Code, '-', Asset.Code, '-', Unit.Code)` matching the PRD example `GG-CG-01`.
2. **Compose friendly name:** `concat(Asset.DisplayName, ', ', Unit.DisplayName)` (e.g. `Calgary Energy Centre, Unit 01`)
3. **HTTP request to SharePoint REST API** (`POST /_api/web/lists`):
   - Body: `{ "Title": "{{libraryCode}}", "BaseTemplate": 101, "Description": "{{friendlyName}}", "ContentTypesEnabled": true }`
   - Auth: service account token via Azure AD (Sites.Selected scope; transient Site Owner during dev provisioning per Q3 + decision memo)
4. **Bind content type** via second HTTP request: `POST /_api/web/lists/getbytitle('{{libraryCode}}')/contenttypes/addAvailableContentType` with `Generation Drawing Information` content type ID (`0x010100C593949...30` per PRD section 8.2)
5. **Configure versioning:** `PATCH /_api/web/lists/getbytitle('{{libraryCode}}')` with `{ "EnableVersioning": true, "EnableMinorVersions": false, "ForceCheckout": false }`
6. **Apply security-trimmed permissions:** break role inheritance + grant Read to all three Entra groups (`sg-enmax-autocad-users/approvers/admins`)
7. **Construct library URL:** `concat(AppConfig.SharePointSiteUrl, '/', libraryCode)`
8. **Update Asset-Unit row** with `enmax_acdnsplibraryurl` = computed URL
9. **Audit Event:** `Event=Created`, Source=Flow, Reason="SharePoint library provisioned"

**Idempotency:** the trigger filter `_enmax_acdnsplibraryurl_value is null` prevents re-runs. If a manual re-run is needed (recovery), an admin clears the URL column first.

**Permission flow:** the service account holds Read on the site collection permanently. The transient Site Owner permission (for list creation) is granted via runbook during dev-tenant first build and removed afterward. **Phase 1 design assumption:** all libraries are pre-provisioned during dev-tenant bootstrap; subsequent UAT/prod provisioning is also a runbook activity, not a runtime flow. If the runtime flow is required (e.g. mid-Phase-1 new Asset-Unit added), the runbook documents the temporary grant procedure.

## Step 3 — Flow: `On Revision Submitted → Index SharePoint and Notify Approvers`

**Trigger:** Dataverse "When a row is updated" on `enmax_autocadcheckout`. Filter: `enmax_acdnstatus eq 2` (AwaitingValidation).

**Steps:**

1. **Guard against re-entry:** if `_modifiedby_value` = service account, exit
2. **Retrieve Drawing + Asset-Unit:** to get the library URL prefix
3. **List SharePoint files** via REST: `GET {libraryUrl}/_api/web/lists/getbytitle('{{libraryCode}}')/items?$filter=startswith(FileLeafRef,'{{drawingPrefix}}')&$select=FileLeafRef,FileRef,ServerRelativeUrl,EncodedAbsoluteUrl,UniqueId,Modified`
   - Where `drawingPrefix` = `BB-AA-UU-DDD-SSS-KK-nnnn` (the parent Drawing's full ENMAX Number)
4. **Parse results:** extract one entry per matching file
5. **Match files to Sheet rows:**
   - Each Sheet row has `Filename = BB-AA-UU-DDD-SSS-KK-nnnn-sss.pdf`
   - Match by exact `FileLeafRef = Sheet.Filename`
6. **For each matched Sheet (apply to each):**
   - Update `enmax_autocadsheet`: `SharePointUrl = EncodedAbsoluteUrl`, `SharePointItemId = UniqueId`, `State = AwaitingValidation` (4)
7. **Compute missing sheets:** any Sheet row whose Filename had no SharePoint match
8. **If any sheets missing:** flag on Drawing row (add to `Notes` column or separate `MissingSheets` JSON column — TODO: add column to plan #02 schema if not present). Surface to approver in validation panel.
9. **Update Drawing.State** → AwaitingValidation (3)
10. **Update Checkout** with `NewPDFUrls` = JSON array of captured EncodedAbsoluteUrl values
11. **Notify approvers + admins** via three channels (mirror plan #05 Step 4 pattern):
    - Email via child flow `Send_Validation_Needed_Email` (Step 6) using template (Step 8 below)
    - Teams adaptive card (Step 8 below)
    - In-App Notification rows for every Approver + Admin
12. **Audit Event:** `Event=StateChanged`, From=CheckedOut, To=AwaitingValidation

**SharePoint API auth detail:** call uses service-account JWT acquired via Azure AD client-credentials flow with `Sites.Selected` resource scope on the specific site. Token cached for ~60 min within the flow run; refresh on expiry. Standard MSAL pattern in Power Automate HTTP action via Azure AD connector.

**Error handling:**
- SharePoint API returns 403 → flow throws "SharePoint permission denied; check service account scope" + admin notification
- SharePoint API returns 404 (library not found) → admin notification "Library not provisioned for Asset-Unit X-Y"; Checkout reverted to Open
- Zero files matched prefix → flag all sheets as missing; proceed to approver with empty NewPDFUrls (approver sees "No files found; user must upload before resubmitting")

## Step 4 — Flow: `On Checkin Approved → Finalise Drawing`

**Trigger:** Dataverse "When a row is updated" on `enmax_autocadcheckout`. Filter: `enmax_acdnstatus eq 3` (ClosedApproved).

**Steps:**

1. **Guard against re-entry**
2. **Retrieve Drawing + parent Checkout's captured NewRevision + NewPDFUrls**
3. **Update each Sheet row:** `SharePointUrl` = corresponding URL from NewPDFUrls (canonical hot-link); `State = Available` (2)
4. **Update Drawing row:**
   - `CurrentRevision` = Checkout.NewRevision
   - `RevisionDate` = utcNow()
   - `State` = CheckedIn (4) — terminal post-validation state per PRD section 27
   - Then immediately transition `State` → Available (1) to return to general availability (per glossary: "CheckedIn — The terminal post-validation state that returns the Drawing to general availability with the bumped revision")
   - **Why two writes:** CheckedIn is the audit marker; Available is the post-validation operational state. Audit log captures both transitions for traceability.
5. **Update Checkout:** `ClosedOn=utcNow()`, `ClosedBy=approver` (already set by action in Step 1.2)
6. **Notify requester (Checkout.CheckedOutBy):** email + Teams + in-app
   - Template subject: `Validated: {{DrawingNumber}} — Revision {{NewRevision}}`
   - Body: "Your revision was approved. Drawing is back in service at Revision {{NewRevision}}."
7. **Audit Events** (multiple):
   - Drawing: StateChanged AwaitingValidation → CheckedIn → Available
   - Each Sheet: StateChanged AwaitingValidation → Available
   - Checkout: ApprovalGranted

**No SharePoint writes.** The PDFs already exist in SharePoint at their canonical URLs; this flow just finalises the Dataverse references.

## Step 5 — Flow: `On Checkin Declined → Revert to Checked Out`

**Trigger:** Dataverse "When a row is updated" on `enmax_autocadcheckout`. Filter: `enmax_acdnstatus eq 4` (ClosedDeclined).

**Steps:**

1. **Guard against re-entry**
2. **Retrieve Drawing**
3. **Clear captured Sheet URLs:** for each Sheet, set `SharePointUrl=null`, `SharePointItemId=null`, `State=CheckedOut` (3)
4. **Re-open Checkout:** set `Status=Open` (1), clear `ClosedOn`, `ClosedBy`, `ValidationReason` stored in column
5. **Update Drawing.State** → CheckedOut (2)
6. **Notify requester** with declined reason verbatim across 3 channels
7. **Audit Event:** `Event=ApprovalDenied`, Reason=Checkout.ValidationReason

The user fixes their PDFs in SharePoint (uploads new versions w/ same filenames; SP creates new major versions natively) and clicks Submit Revision again.

## Step 6 — Child Flows: Validation Emails

Two new child flows mirroring plan #05's pattern:

- `Send_Validation_Needed_Email` — to approvers/admins when revision submitted
- `Send_Validation_Result_Email` — to requester when approved or declined

Same shared-mailbox `Send an email from a shared mailbox` action; same Q5 no-reply footer; templates in Step 8.

## Step 7 — Flow: `On Force Checkin → Admin Override`

**Trigger:** Dataverse "When a row is updated" on `enmax_autocadcheckout`. Filter: `enmax_acdnstatus eq 5` (ClosedForced).

**Steps:**

1. **Guard against re-entry**
2. **Retrieve Drawing + original Checkout.CheckedOutBy user**
3. **Update Drawing.State** → Available (1)
4. **Clear any captured NewPDFUrls** (force-checkin discards in-flight revision)
5. **For each Sheet currently in CheckedOut or AwaitingValidation:** revert to Available (2) if it was previously Available, or PendingInitialUpload (1) if it was never indexed
6. **Notify original CheckedOutBy user** w/ admin's typed reason
7. **Audit Event:** `Event=ForceCheckedIn`, Reason=action.Reason, ActedBy=admin

**No SharePoint writes.** Force-checkin is a Dataverse state correction; the user's PDFs in SharePoint remain. The admin's reason in the audit log explains why the override was needed.

## Step 8 — Flow: `Stale Checkout Reminder` (Scheduled)

**Trigger:** Scheduled — daily 06:00 MT (Mountain Time, Calgary local). Power Automate's recurrence trigger w/ `Time zone = (UTC-07:00) Mountain Time (US & Canada)`.

**Steps:**

1. **Read AppConfig.StaleCheckoutMonths** → split on `,` → `[3, 6, 12]`
2. **For each threshold months in list:**
   - **List Checkout rows** where `Status=Open` AND `CheckedOutOn ≤ utcNow() - monthsToMs(threshold)` AND `ReminderStage < thresholdStage`
   - Where thresholdStage = ThreeMonth (1) for 3, SixMonth (2) for 6, TwelveMonth (3) for 12
3. **For each stale Checkout (apply to each):**
   - **Notify CheckedOutBy user** w/ email + Teams + in-app
   - **Notify all Admins** w/ in-app only (volume control)
   - **Update Checkout.ReminderStage** to current threshold stage
4. **Audit Event** per reminder: `Event=Created`, Source=Flow, Subject=Checkout, Reason="StaleCheckoutReminder Stage={{stage}}"

**Why thresholds idempotent:** the `ReminderStage` column on Checkout tracks the most recent reminder sent. A Checkout at 7 months that's never been reminded gets both the 3-month and 6-month reminders in succession on first run (since ReminderStage was None) — handled by the loop iterating stages in order. Subsequent daily runs send only NEW reminders (those above current ReminderStage).

**Email template** (`reminder_stale_checkout.html`):

```
Subject: Reminder: {{DrawingNumber}} checked out for {{Months}} months

Body:
You checked out {{DrawingNumber}} on {{CheckedOutOn}} and have not yet submitted a revision.

  Months out: {{Months}}
  Library:    {{SharePointLibraryUrl}}

If you no longer need this checkout, ask an admin to force check-in.

[Submit revision →]    [Open in app →]

---
This message was sent from a no-reply address. Replies are not monitored.
Contact the document controller for help.
```

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

**Integration tests (real Dataverse + SharePoint, runs in cd-dev.yml):**

| # | Test | Asserts |
|---|------|---------|
| 1 | Check out → Drawing.state=CheckedOut, Checkout row created with Status=Open | |
| 2 | Check out twice → second call throws "already checked out" | Alt-key race protection |
| 3 | SP provisioning flow creates library on Asset-Unit activation | SP REST list call returns the new library |
| 4 | Revision submit with all files uploaded → all Sheet URLs captured, Drawing.state=AwaitingValidation | |
| 5 | Revision submit with one file missing → Drawing has MissingSheets flag set | |
| 6 | Approve checkin → Drawing.CurrentRevision bumped, state=Available | |
| 7 | Decline checkin → Sheet URLs cleared, Drawing.state=CheckedOut | |
| 8 | Force checkin → Drawing.state=Available, audit log records ForceCheckedIn event | |
| 9 | Stale reminder scheduled flow fires at 3-month boundary | Mock clock; assert ReminderStage updated and notification sent |

**SharePoint provisioning smoke** (manual, runbook #004 verifies):
- Create new Asset-Unit row → library appears at `{site}/BB-AA-UU` within 60s
- Content type bound; versioning enabled; minor versions disabled
- Three Entra groups have Read

## Verification — End-to-End Checklist

```powershell
# Code App tests
Set-Location apps/code-app
npm test -- src/features/checkout         # all 11 component tests pass

# Pack + import
Set-Location ../..
python solution/scripts/pack.py
python solution/scripts/import.py         # imports 3 actions, 5 flows, 2 child flows

# Manual smoke (3 test accounts; needs a Drawing in Available state from plan #05)
#
# 1. As User:
#    - Open Drawing → Check Out → expect Drawing.state=CheckedOut visible in panel
#    - Navigate to SP library URL (surfaced) → upload one PDF named per deterministic pattern
#    - Click Submit Revision → enter "B" → confirm checkbox → submit
#    - Expect notification "Revision submitted; awaiting validation"
#
# 2. As Approver:
#    - In app, see in-app notification + email + Teams card
#    - Open ValidationDrawer → see uploaded file link + missing-sheets summary
#    - Approve → expect Drawing.state=Available, CurrentRevision=B
#
# 3. As Admin (force-checkin):
#    - Find a CheckedOut Drawing → ForceCheckInDialog → enter reason → confirm
#    - Expect Drawing back to Available; original user notified
#
# 4. Stale reminder (manual time-shift):
#    - In dev tenant, manually update a Checkout row: CheckedOutOn = utcNow() - 4 months
#    - Trigger the scheduled flow manually via maker UI Run-now
#    - Expect ReminderStage=ThreeMonth, in-app notification appears for user
```

**Acceptance:**
- All 11 Code App tests + 9 integration tests pass
- End-to-end smoke completes through full revision cycle
- Force-checkin works; audit log captures override
- Stale reminder fires correctly at boundary
- Plug-in concurrency test still passes (regression)
- PR reviewed by Rahul, squash-merged to `dev`

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
| Service account loses Sites.Selected READ during quarterly secret rotation | Synthetic monitor flow runs hourly per PRD risk #2 mitigation; alerts admin on first 403; runbook #009 re-grant procedure |
| `MissingSheets` flag column not in plan #02 schema | TODO below; add via maker UI export-unpack-commit; column is single Yes/No or JSON list of missing sheet numbers |
| Force-checkin discards user's in-flight revision URLs | Acceptable per Force Checkin = Admin Override semantics; user is offline / unavailable so re-upload is irrelevant. If admin needs to preserve the URLs, they Approve the checkin instead. |

## TODOs Left in This Plan

- **Add `MissingSheets` column to Drawing table** (plan #02 Step 4 addition). Author via maker UI; export+unpack+commit. Single line addition to the schema.
- **Verify library code includes Business prefix** — PRD section 8.2 example `GG-CG-01` suggests yes (3-segment); plan documents this assumption. Confirm by reading the canonical Asset-Unit naming source.
- **Mountain Time DST handling** — scheduled flow at 06:00 MT shifts twice yearly. Power Automate recurrence handles DST natively; confirm during first scheduled-trigger test (mid-March or early November).
- **Synthetic monitor flow for SP service-account permission health** — referenced in plan but not authored here. Small follow-up plan; one-flow effort.
- **Force-checkin notification copy** — Step 7 sends notification to original CheckedOutBy user w/ admin's reason; copy should be sensitive ("Your check-out was force-closed by an administrator; the recorded reason is: {{reason}}. Contact {{admin}} for details."). Finalise template in Step 8 implementation.
