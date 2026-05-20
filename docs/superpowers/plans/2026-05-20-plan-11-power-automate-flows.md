# Plan #11 — Power Automate Flows (All Deferred Flow Development)

**Date:** 2026-05-20
**Owner:** Engineering (Claude Code agent + one human reviewer: Rahul Akmol)
**Spec:** `2026-05-17-phase-1-cut-line-spec.md`
**Deferred from:** Plans #05 (Steps 4–10), #06 (Steps 1.1–1.3, 2–8), #08 (Steps 2, 4, 6, 7), #10 (Step 1)
**Estimated effort:** 28–36 hours
**Branch:** `feat/011-power-automate-flows` → PR to `dev`
**Phase:** Deferred — implement after all non-flow work from Plans #05–#10 is merged to `dev`
**Blocked by:**
- Plans #01–#10 merged (Code App + plugin + schema work complete)
- IssueNumbers plugin deployed and passing concurrency test (plan #03 / runbook #010)
- ApproveReservation + DeclineReservation plugins deployed (runbook #010)
- Service account `Send As` on `noreply-autocad@*` mailbox confirmed (runbook #001)
- Teams bot permitted for 1:1 adaptive cards (runbook #008)
- Azure Key Vault secret for SharePoint service account populated
- SharePoint Generation Drawings site collection exists (runbook #004)
- `Sites.Selected` FullControl granted on the site collection (Q3 re-decision 2026-05-18)

## Context

This plan consolidates all Power Automate flow development deferred from Plans #05, #06, #08, and #10. The non-flow Code App work (wizards, grids, panels, hooks) and plugin work in those plans ships first. Flows are implemented afterward in a single branch so all flow infrastructure can be deployed as one solution import.

**Note on `enmax_acdnApproveReservation` / `enmax_acdnDeclineReservation`:** These were implemented as C# plugins (`ApproveReservationPlugin`, `DeclineReservationPlugin`) per runbook #010, not as flows. No flow development needed for those actions.

The plan covers four groups:
- **Group A** — Reservation flows (from Plan #05 Steps 4–10)
- **Group B** — Check-out / Check-in / Revision flows (from Plan #06 Steps 1.1–1.3, 2–8)
- **Group C** — Broadcast flows (from Plan #08 Steps 2, 4, 6, 7)
- **Group D** — Release Drawing flow (from Plan #10 Step 1)

## Prerequisites

- Plans #01–#10 non-flow work merged to `dev`
- Schema tables from plan #02 live in dev tenant
- IssueNumbers, Approve, Decline plugins deployed (runbook #010)
- App Configuration rows seeded (plan #02 Step 9)
- SharePoint site collection and content types configured (runbooks #004, #005)
- Service account credentials in Azure Key Vault

---

## Group A — Reservation Flows (from Plan #05 Steps 4–10)

Prerequisites: Reservation, Drawing, Sheet, In-App Notification, Audit Event tables exist (plan #02); `enmax_acdnIssueNumbers` callable (plan #03).

### A1 — Flow: `On Reservation Created → Notify Admins`

**Power Automate flow** (`solution/src/Workflows/On_Reservation_Created_Notify_Admins/`).

**Trigger:** Dataverse "When a row is added" → `enmax_autocadreservation`. Filter: `enmax_acdnstatus eq 1` (Pending).

**Flow steps:**

1. **Initialize variables:** `RequesterContext`, `CompositionPreview`, `DeepLink`
2. **Retrieve related rows:** Business, Asset, Unit, Domain, System, Kind (parallel branch — 6 lookups)
3. **Compose preview string:** `concat(Business.Code, '-', Asset.Code, '-', Unit.Code, '-', Domain.Code, '-', System.Code, '-', Kind.Code, '-????')`
4. **Compose deep link:** `concat('https://apps.powerapps.com/play/', envId, '/', appId, '?path=approvals/', triggerOutputs().body['enmax_acdnreservationid'])` — `envId` and `appId` from env vars
5. **List admin + approver team members:** Two parallel `List rows` calls on `teammemberships` filtered by team ID; merge results, dedupe
6. **For each recipient (apply to each):**
   - **Send email** via child flow `Send_Approval_Needed_Email` (Step A4)
   - **Post adaptive card** via Teams bot `Post adaptive card and wait for a response` (1:1 chat)
   - **Create In-App Notification row** (field mapping in Step A7)
7. **Adaptive card response handler:**
   - `verb = approve` → invoke `enmax_acdnApproveReservation` with `Decision = Approved`
   - `verb = decline` → collect reason from Teams textarea, invoke with `Decision = Declined, Reason = inputs.reason`
8. **Log Audit Event:** `Event = Created`, `Source = Flow`, `ActedBy = service account`, `ActedOnBehalfOf = Requester`

**Idempotency:** admin acting via the in-app grid calls the action directly. Pending Teams cards show "Already decided" because Approve/Decline plugins reject transitions on non-Pending rows.

**Retry policy:** default Power Automate retry (4 retries, exponential). Email failures retry once then write to error queue.

### A2 — Flow: `On Reservation Approved → Issue Drawings and Sheets`

**Trigger:** Dataverse "When a row is updated" → `enmax_autocadreservation`. Filter: `enmax_acdnstatus eq 2 and _modifiedby_value ne '<service-account-userid>'`. *Trigger-level filter per architecture review Finding 5.5.*

**Flow steps:**

1. **Pre-validate batch capacity (per architecture review Finding 5.3):**
   - Query target Number Sequence row; assert `LastIssued + Reservation.Count ≤ 9999` — else exit, revert Reservation to Pending, notify admin
   - Assert `DrawingCount × SheetsPerDrawing ≤ 1000`
   - Assert SharePoint Library URL populated on Asset-Unit row — else exit, revert, notify admin "library not provisioned"
2. **Retrieve related rows** (Business, Asset, Unit, Domain, System, Kind)
3. **Invoke `enmax_acdnIssueNumbers`** with 6 segment codes + Count → `IssuedNumbers` JSON array
4. **Parse IssuedNumbers** into array
5. **For each issued number (serial, NOT parallel):**
   - **Create Drawing row:** ENMAX Number = `concat(..., formatNumber(currentItem, '0000'))`, State = Available (2), SharePoint Library URL from Asset-Unit
   - **For sheet number 1..SheetsPerDrawing:** Create Sheet row with deterministic Filename = `concat(ENMAXNumber, '-', formatNumber(sheetIndex, '000'), '.pdf')`, State = PendingInitialUpload (1)
6. **Update Reservation.IssuedNumbers** with JSON array
7. **Notify requester** via email (template A5-B), Teams card, and In-App Notification row
8. **Log Audit Event:** `Event = ApprovalGranted`, From = Pending, To = Approved
9. **Log per-Drawing Audit Events:** `Event = Created`

**Failure handling:**
- IssueNumbers throws → revert Reservation to Pending, notify admin via 3 channels
- Partial Drawing/Sheet create → log audit, surface to admin; do NOT auto-retry (numbers already issued)

### A3 — Flow: `On Reservation Declined → Notify Requester`

**Trigger:** Dataverse "When a row is updated" → `enmax_autocadreservation`. Filter: `enmax_acdnstatus eq 3 and _modifiedby_value ne '<service-account-userid>'`. *Trigger-level filter per Finding 5.5.*

**Flow steps:**

1. **Notify requester** via email (template A5-C), Teams card, and In-App Notification row
2. **Log Audit Event:** `Event = ApprovalDenied`, From = Pending, To = Declined, Reason = DeclineReason

### A4 — Child Flows: `Send_Approval_Needed_Email` + `Send_Approval_Result_Email`

Two child flows in `solution/src/Workflows/Child_Send_Approval_Needed_Email/` and `Child_Send_Approval_Result_Email/`.

**Inputs (both):** `RecipientEmail`, `RecipientDisplayName`, `ReservationId`, `Payload` (JSON), `DeepLink`

**Send action:** `Office 365 Outlook → Send an email from a shared mailbox (V2)`:
- `Mailbox Address` = `SharedMailboxAddress` App Config row value (read at flow start)
- `Body` (HTML) = mustache-substituted template (Step A5)
- `Is HTML` = Yes

**Inline approve/decline (approval_needed email only):** Outlook actionable-messages `<script type="application/ld+json">` block in `<head>`. Sender registered via Actionable Email Developer Dashboard (one-time, runbook #009 addendum).

### A5 — Email Templates

Stored as Web Resources under `solution/src/WebResources/email_templates/`. Child flow reads via `Get Web Resource` action at runtime.

Per Q5 no-reply override: shared mailbox is `noreply-autocad@*`; replies are not monitored.

#### Template A: `approval_needed.html`

```
Subject: Reservation pending: {{ReservationId}}: {{CompositionPreview}}

A new drawing number reservation is awaiting your approval.

  Requested by : {{RequesterDisplayName}} ({{RequesterEmail}})
  Reason       : {{Reason}}
  Composition  : {{CompositionPreview}}
  Count        : {{Count}}
  Override     : {{OverrideText}}

[Approve]   [Decline]   [Open in app →]

Reference: {{ReservationId}}

---
This message was sent from a no-reply address. Replies are not monitored.
To respond, open the application: {{AppUrl}}
```

#### Template B: `approval_approved.html`

```
Subject: Approved: {{ReservationId}}: {{IssuedRange}}

Your reservation has been approved.

  Numbers issued : {{IssuedNumbersFormatted}}
  Approved by    : {{ApproverDisplayName}}
  Approved on    : {{ApprovedOnFormatted}}

Next step: upload your PDFs to the SharePoint library:
{{SharePointLibraryUrl}}

[Open in app →]

---
This message was sent from a no-reply address. Replies are not monitored.
```

#### Template C: `approval_declined.html`

```
Subject: Declined: {{ReservationId}}

Your reservation has been declined.

  Reason : {{DeclineReason}}
  By     : {{ApproverDisplayName}}

[Edit and resubmit →]

---
This message was sent from a no-reply address. Replies are not monitored.
```

### A6 — Adaptive Card Template

`solution/src/WebResources/adaptive_cards/approval_needed_card.json`. Adaptive Card schema 1.5. Decline via inline ShowCard with textarea so approve/decline is a single round-trip:

```json
"actions": [
  { "type": "Action.ShowCard", "title": "Decline",
    "card": {
      "type": "AdaptiveCard",
      "body": [
        { "type": "Input.Text", "id": "declineReason", "isMultiline": true,
          "placeholder": "Reason (min 10 chars)", "isRequired": true }
      ],
      "actions": [
        { "type": "Action.Submit", "title": "Confirm decline",
          "data": { "verb": "decline", "id": "{{ReservationId}}" } }
      ]
    }
  },
  { "type": "Action.Submit", "title": "Approve",
    "data": { "verb": "approve", "id": "{{ReservationId}}" } },
  { "type": "Action.OpenUrl", "title": "Open in app", "url": "{{DeepLink}}" }
]
```

### A7 — In-App Notification Writes

Every flow that fans out email + Teams also writes an `enmax_autocadinappnotification` row per recipient. Field mapping:

```
Title:        concat(Action, ': ', ReservationId)
Body:         plain-text variant of email body
Severity:     Warning for "pending"; Success for "approved"; Critical for "declined"
SourceEvent:  ReservationPending (add to option set) / ReservationApproved=1 / ReservationDeclined=2
SubjectTable: enmax_autocadreservation
SubjectId:    ReservationId
DeepLinkPath: approvals/{{ReservationId}} (admin) OR my-items/reservations/{{ReservationId}} (requester)
Read:         false
```

**Idempotency:** check `(Recipient, SubjectId, SourceEvent)` triple before creating; re-runs do not duplicate.

**TODO:** Add `ReservationPending` to `enmax_acdn_sourceevent` option set if missing from plan #02 Step 2.

---

## Group B — Check-Out / Check-In / Revision Flows (from Plan #06 Steps 1.1–1.3, 2–8)

Prerequisites: plans #01–#06 non-flow work merged; Drawing rows exist in Available state; SharePoint configured (runbooks #004, #005).

### B1 — Custom Action + Flow: `enmax_acdnCheckOutDrawing`

**Custom API definition** (author in maker UI, export + unpack + commit):

| Property | Value |
|----------|-------|
| Binding | Entity (`enmax_autocaddrawing`) |
| Is function | No |
| Inputs | (none beyond bound row) |
| Outputs | `CheckoutId` (String) |

**Flow implementation** (triggered by action message):

1. Guard: `Drawing.State ≠ Available` → throw "Drawing must be Available; current state is {{state}}"
2. Guard: Open Checkout row exists for Drawing → throw "Drawing already checked out by {{otherUser.displayName}}"
3. Create Checkout row: `Status=Open` (1), `CheckedOutBy=callingUser`, `CheckedOutOn=utcNow()`, `ReminderStage=None` (0)
4. Update Drawing: `State=CheckedOut` (2)
5. Write Audit Event: `Event=StateChanged`, From=Available, To=CheckedOut
6. Return new `CheckoutId`

**Alt-key safety:** `(Drawing, Status)` alternate key on Checkout (plan #02 Step 5) rejects duplicate Open rows even in a race.

### B2 — Custom Action + Flow: `enmax_acdnApproveCheckin`

**Custom API definition:**

| Property | Value |
|----------|-------|
| Binding | Entity (`enmax_autocadcheckout`) |
| Inputs | `Decision` (OptionSet: Approved/Declined), `Reason` (String, required when Declined) |
| Outputs | `CheckoutId`, `NewStatus`, `DrawingState` |

**Flow implementation:** updates Checkout.Status → ClosedApproved (3) or ClosedDeclined (4). Downstream flows B5/B6 fire from that update. No revision math here.

### B3 — Custom Action + Flow: `enmax_acdnForceCheckin`

**Custom API definition:**

| Property | Value |
|----------|-------|
| Binding | Entity (`enmax_autocadcheckout`) |
| Inputs | `Reason` (String, required) |
| Outputs | `CheckoutId`, `DrawingState` |

**Flow implementation:** updates Checkout.Status → ClosedForced (5), Drawing.State → Available (1). Admin-only (action registered with `Privilege Required = Admin role`).

### B4 — Flow: `On Asset-Unit Activated → Provision SharePoint Library`

**Trigger:** Dataverse "When a row is added or modified" on `enmax_autocadassetunit`. Filter: `enmax_acdnstatus eq 1` AND `_enmax_acdnsplibraryurl_value` is null.

**Steps:**

1. **Compose library code:** `concat(Business.Code, '-', Asset.Code, '-', Unit.Code)` (e.g. `GG-CG-01` per PRD section 8.2 — verify Business prefix at implementation)
2. **Compose friendly name:** `concat(Asset.DisplayName, ', ', Unit.DisplayName)`
3. **HTTP `POST /_api/web/lists`:** `{ "Title": "{{libraryCode}}", "BaseTemplate": 101, "ContentTypesEnabled": true }`. Auth: Azure AD client-credentials with `Sites.Selected` FullControl scope.
4. **Bind content type:** `POST /_api/web/lists/.../contenttypes/addAvailableContentType` with `Generation Drawing Information` ID
5. **Configure versioning:** `PATCH`: `{ "EnableVersioning": true, "EnableMinorVersions": false, "ForceCheckout": false }`
6. **Apply permissions:** break inheritance + grant Read to all three Entra groups
7. **Update Asset-Unit row:** `enmax_acdnsplibraryurl` = `concat(AppConfig.SharePointSiteUrl, '/', libraryCode)`
8. **Audit Event:** `Event=Created`, Source=Flow, Reason="SharePoint library provisioned"

**Idempotency:** trigger filter `_enmax_acdnsplibraryurl_value is null` prevents re-runs. Manual re-run: admin clears URL column first.

### B5 — Flow: `On Revision Submitted → Index SharePoint and Notify Approvers`

**Trigger:** Dataverse "When a row is updated" on `enmax_autocadcheckout`. Filter: `enmax_acdnstatus eq 2 and _modifiedby_value ne '<service-account-userid>'`. *Trigger-level filter per Finding 5.5.*

**Steps:**

1. **Retrieve Drawing + Asset-Unit** to get library URL
2. **List SharePoint files:** `GET {libraryUrl}/_api/web/lists/.../items?$filter=startswith(FileLeafRef,'{{drawingPrefix}}')&$select=FileLeafRef,EncodedAbsoluteUrl,UniqueId`
3. **Match files to Sheet rows** by exact `FileLeafRef = Sheet.Filename`
4. **For each matched Sheet:** update `SharePointUrl = EncodedAbsoluteUrl`, `SharePointItemId = UniqueId`, `State = AwaitingValidation` (4)
5. **Compute missing sheets** (Sheet rows with no SP match); flag on Drawing `MissingSheets` column
6. **Update Drawing.State** → AwaitingValidation (3)
7. **Update Checkout.NewPDFUrls** with JSON array of captured URLs
8. **Notify approvers + admins** via email (child flow B8), Teams card, In-App Notification rows
9. **Audit Event:** `Event=StateChanged`, From=CheckedOut, To=AwaitingValidation

**Error handling:** SP 403 → throw + admin notify. SP 404 → admin notify "library not provisioned"; revert Checkout to Open. Zero files matched → flag all sheets missing; proceed.

### B6 — Flow: `On Checkin Approved → Finalise Drawing`

**Trigger:** Dataverse "When a row is updated" on `enmax_autocadcheckout`. Filter: `enmax_acdnstatus eq 3 and _modifiedby_value ne '<service-account-userid>'`. *Trigger-level filter per Finding 5.5.*

**Steps:**

1. **Retrieve Drawing + Checkout.NewRevision + NewPDFUrls**
2. **Update each Sheet:** `SharePointUrl` from NewPDFUrls, `State = Available` (2)
3. **Update Drawing:** `CurrentRevision = Checkout.NewRevision`, `RevisionDate = utcNow()`, `State = CheckedIn` (4) then immediately `State = Available` (1). *Why two writes: CheckedIn is the audit marker; Available is the operational state. Both transitions captured in audit log.*
4. **Update Checkout:** `ClosedOn=utcNow()`, `ClosedBy=approver`
5. **Notify requester** via email (subject: `Validated: {{DrawingNumber}} — Revision {{NewRevision}}`), Teams, In-App
6. **Audit Events:** Drawing StateChanged AwaitingValidation → CheckedIn → Available; each Sheet StateChanged; Checkout ApprovalGranted

### B7 — Flow: `On Checkin Declined → Revert to Checked Out`

**Trigger:** Dataverse "When a row is updated" on `enmax_autocadcheckout`. Filter: `enmax_acdnstatus eq 4 and _modifiedby_value ne '<service-account-userid>'`. *Trigger-level filter per Finding 5.5.*

**Steps:**

1. **Retrieve Drawing**
2. **Clear Sheet URLs:** `SharePointUrl=null`, `SharePointItemId=null`, `State=CheckedOut` (3)
3. **Re-open Checkout:** `Status=Open` (1), clear `ClosedOn`, `ClosedBy`
4. **Update Drawing.State** → CheckedOut (2)
5. **Notify requester** with decline reason via 3 channels
6. **Audit Event:** `Event=ApprovalDenied`, Reason=Checkout.ValidationReason

### B8 — Child Flows: Validation Emails

Two child flows mirroring Plan #05 Group A pattern:

- `Send_Validation_Needed_Email` — to approvers/admins when revision submitted
- `Send_Validation_Result_Email` — to requester when approved or declined

Same shared-mailbox send action + Q5 no-reply footer.

**Stale checkout reminder template** (`reminder_stale_checkout.html`):

```
Subject: Reminder: {{DrawingNumber}} checked out for {{Months}} months

You checked out {{DrawingNumber}} on {{CheckedOutOn}} and have not submitted a revision.

  Months out: {{Months}}
  Library:    {{SharePointLibraryUrl}}

[Submit revision →]    [Open in app →]

---
This message was sent from a no-reply address. Replies are not monitored.
```

### B9 — Flow: `On Force Checkin → Admin Override`

**Trigger:** Dataverse "When a row is updated" on `enmax_autocadcheckout`. Filter: `enmax_acdnstatus eq 5 and _modifiedby_value ne '<service-account-userid>'`. *Trigger-level filter per Finding 5.5.*

**Steps:**

1. **Retrieve Drawing + original Checkout.CheckedOutBy**
2. **Update Drawing.State** → Available (1)
3. **Clear Checkout.NewPDFUrls** (in-flight revision discarded)
4. **Revert Sheets** in CheckedOut or AwaitingValidation → Available (2) or PendingInitialUpload (1)
5. **Notify original CheckedOutBy** via 3 channels with admin's typed reason
6. **Audit Event:** `Event=ForceCheckedIn`, Reason=action.Reason, ActedBy=admin

**No SharePoint writes.** User's PDFs remain. Force-checkin is a Dataverse state correction only.

### B10 — Flow: `Stale Checkout Reminder` (Scheduled)

**Trigger:** Scheduled daily 06:00 MT. Power Automate recurrence trigger w/ `Time zone = (UTC-07:00) Mountain Time (US & Canada)`.

**Steps:**

1. **Read AppConfig.StaleCheckoutMonths** → split → `[3, 6, 12]`
2. **For each threshold:** list Checkout rows where `Status=Open AND CheckedOutOn ≤ utcNow() - threshold AND ReminderStage < thresholdStage`
3. **For each stale Checkout:**
   - Notify CheckedOutBy via email + Teams + in-app
   - Notify all Admins via in-app only
   - Update `Checkout.ReminderStage` to current threshold stage
4. **Audit Event:** `Event=Created`, Reason="StaleCheckoutReminder Stage={{stage}}"`

**Idempotency:** `ReminderStage` tracks most recent reminder sent. Stages iterated in order so missed thresholds catch up on first run.

---

## Group C — Broadcast Flows (from Plan #08 Steps 2, 4, 6, 7)

Prerequisites: Broadcast, Broadcast Dismissal, In-App Notification tables exist (plan #02); plan #08 Code App work (Broadcast author UI, Bell feed, Home dashboard) deployed.

### C1 — Flow: Broadcast Fan-Out

Per PRD section 10.

**Trigger:** Two triggers:
1. Dataverse "When a row is created or updated" on `enmax_autocadbroadcast`. Filter: `_modifiedby_value ne '<service-account-userid>'` (admin edits only; excludes status-compute re-writes per Anti-Pattern #3)
2. Scheduled recurrence every `AppConfig.BroadcastFanOutCadenceMinutes` (60 by default)

**Steps:**

1. **List active broadcasts:** `Status=Active AND StartsAt ≤ now AND ExpiresAt > now`
2. **For each active broadcast:**
   - **Resolve audience users** from Entra groups (Users / Approvers / Admins / Everyone = union of all three)
   - **For each user in audience:**
     - Check existing In-App Notification: `Recipient=user AND SubjectTable=enmax_autocadbroadcast AND SubjectId=broadcastId`
     - If exists → skip (idempotent); if not → create In-App Notification row (DeepLinkPath = `broadcasts/{broadcastId}`)
3. **Audit Event:** record fan-out run stats

**Performance:** worst case 670 users × 1 broadcast = 1340 calls/run × 24 runs/day = ~32K. Within 40K/day quota.

### C2 — Flow: Broadcast Status Computation

**Trigger:** Scheduled daily 00:30 MT + Dataverse "When a row is updated" on `enmax_autocadbroadcast` (immediate transition on admin edit).

**Steps:**

1. List all broadcasts in Draft/Scheduled/Active/Expired statuses (excludes Retired)
2. For each: compute new status from StartsAt/ExpiresAt vs. utcNow()
3. Update row if status changed
4. Trigger fan-out flow (C1) on transitions to Active

### C3 — Flow: Number Sequence Critical Threshold Broadcast

Per PRD section 9.4. Scheduled hourly.

**Steps:**

1. **Query** Number Sequence rows where `Status in (Critical, Exhausted)`
2. **For each:**
   - Check existing Broadcast for this SequenceKey within last 7 days — if exists, skip (spam prevention)
   - Create Broadcast row: Title = `Sequence {SequenceKey} approaching exhaustion`, Severity=Critical, Audience=Admins, StartsAt=now, ExpiresAt=now+7 days, RequiresAcknowledgement=true, Pinned=true
3. **Audit Event:** `Event=Created`, Reason="SequenceCriticalBroadcast: {SequenceKey}"

**Idempotency:** 7-day skip window; admin must acknowledge to clear pinned broadcast.

### C4 — Notification Preferences Integration

Per Plan #07 Step 7.2: update all notification flows (A1, A2, A3, B5, B6, B7, B9, B10, C1) to consult `enmax_autocaduserpreference` table before sending email or Teams card.

**Pattern** (added at top of each notify-recipient loop iteration):

```
1. List rows: enmax_autocaduserpreferences where User = currentRecipient
2. If no row: use defaults (Email=true, Teams=true)
3. If EmailEnabled=true: invoke email child flow; else skip
4. If TeamsEnabled=true: post adaptive card; else skip
5. ALWAYS create In-App Notification row (F-33: cannot be disabled)
```

**Flows to update:** A1, A2, A3, B5, B6, B7, B9, B10, C1.

---

## Group D — Release Drawing Flow (from Plan #10 Step 1)

Prerequisites: plan #10 Code App work deployed; Phase 1 UAT-accepted (plan #09 sign-off).

### D1 — Custom Action + Flow: `enmax_acdnReleaseDrawing`

**Custom API definition** (author in maker UI, export + unpack + commit):

| Property | Value |
|----------|-------|
| Binding | Entity (`enmax_autocaddrawing`) |
| Is function | No |
| Inputs | `Reason` (String, max 2000, required when `ReleaseRequiresReason=true`) |
| Outputs | `DrawingId`, `NewState`, `SequenceKeyBurned` |

**Flow implementation** (triggered by action message):

1. Read `AppConfig.ReleaseRequiresReason`; if true and Reason empty → throw "Reason required (min 10 chars)"
2. Guard: `Drawing.State != Available` → throw "Drawing must be Available; current state is {{state}}"
3. Guard: caller must be Drawing.Owner OR Admin role member → else throw "Permission denied"
4. Update Drawing: `State = Void` (6)
5. Update all child Sheets: `State = Void` (6)
6. Audit Event: written automatically by `AuditEmitter` plug-in on Drawing.State Update (plan #07 Step 4b)
7. Notify owner (if caller ≠ owner — admin force-release path) via email + Teams + in-app
8. Return `SequenceKeyBurned` = composed `BB-AA-UU-DDD-SSS-KK-nnnn`

---

## Tests (All Flow-Dependent Integration Tests)

### From Plan #05

| # | Test | Asserts |
|---|------|---------|
| 1 | Create Reservation row → flow fires within 30s | Service-account log entries; admin In-App Notification rows appear |
| 2 | Invoke ApproveReservation action → IssueDrawings flow runs | Drawing + Sheet rows created in expected counts; status transitions logged |
| 3 | Invoke ApproveReservation with Declined + Reason → Decline flow fires | Requester In-App Notification appears |
| 4 | IssueNumbers ceiling exceeded → flow reverts Reservation to Pending + admin notified | End-to-end failure recovery |
| 5 | Adaptive card response handler accepts Approve | Verb=approve → action invoked |
| 6 | Adaptive card response handler accepts Decline with reason | Verb=decline + reason → action invoked with Declined |

### From Plan #06

| # | Test | Asserts |
|---|------|---------|
| 7 | Check out → Drawing.state=CheckedOut, Checkout row created with Status=Open | |
| 8 | Check out twice → second call throws "already checked out" | Alt-key race protection |
| 9 | SP provisioning flow creates library on Asset-Unit activation | SP REST list call returns new library |
| 10 | Revision submit with all files uploaded → Sheet URLs captured, Drawing.state=AwaitingValidation | |
| 11 | Revision submit with one file missing → MissingSheets flag set | |
| 12 | Approve checkin → Drawing.CurrentRevision bumped, state=Available | |
| 13 | Decline checkin → Sheet URLs cleared, Drawing.state=CheckedOut | |
| 14 | Force checkin → Drawing.state=Available, audit ForceCheckedIn | |
| 15 | Stale reminder scheduled flow fires at 3-month boundary | Mock clock; ReminderStage updated; notification sent |

### From Plan #08

| # | Test | Asserts |
|---|------|---------|
| 16 | Fan-out flow creates In-App Notification per user in audience | |
| 17 | Fan-out flow skips users w/ existing notification (idempotent) | |
| 18 | Status compute flow transitions Draft→Active when StartsAt passes | |
| 19 | Status compute triggers fan-out on Active transition | |
| 20 | Number Sequence at LastIssued=9905 → critical broadcast created | |
| 21 | Repeated runs within 7d don't duplicate the broadcast | |
| 22 | Notify flow respects user preference EmailEnabled=false | |
| 23 | Notify flow ALWAYS writes In-App row regardless of preferences | F-33 enforcement |

### From Plan #10

| # | Test | Asserts |
|---|------|---------|
| 24 | User releases own Drawing → State=Void, Sheets all Void, audit StateChanged | |
| 25 | User cannot release another user's Drawing → 403 | Permission boundary |
| 26 | Admin releases another user's Drawing → State=Void, audit OverrideUsed w/ on-behalf-of | |
| 27 | Released Drawing cannot be checked out (state guard from plan #06 Step 1.1 holds) | |

## Verification — End-to-End Checklist

```powershell
# Pack + import all flows + custom actions
Set-Location solution
python scripts/pack.py
python scripts/import.py

# Integration tests
dotnet test solution/plugins/IssueNumbers.Tests --filter "Category=Integration"

# Manual smoke
# Group A: Submit reservation → admin email + Teams + in-app; Approve → Drawing + Sheet rows created
# Group B: Check out → upload PDF → submit revision → approve → Drawing revision bumped
# Group C: Create broadcast → fan-out → bell badge shows; Set sequence LastIssued=9905 → critical broadcast auto-created
# Group D: Release Drawing → State=Void, Sheets=Void, audit captured

# Build + push Code App (if any flow-triggered UI changes need verification)
Set-Location ../apps/code-app
npm run build
npx power-apps push --environmentId $env:DEV_POWER_APPS_ENV_ID
```

**Acceptance:**
- All 27 integration tests pass
- End-to-end manual smoke passes for all four groups
- Notification preferences correctly gate email/Teams (in-app always fires per F-33)
- PR reviewed by Rahul, squash-merged to `dev`

## TODOs

- **Add `ReservationPending` to `enmax_acdn_sourceevent` option set** (from Plan #05)
- **Outlook actionable-messages sender registration:** runbook #009 addendum (non-blocking; Teams + in-app cover approval surface)
- **Library code Business prefix:** confirm `GG-CG-01` vs 2-segment at implementation (from Plan #06)
- **Mountain Time DST handling:** confirm Power Automate recurrence handles DST natively for B10 and C2
- **`MissingSheets` column on Drawing table:** add via maker UI export-unpack-commit (from Plan #06)
- **Notification preference queries add latency:** single `List rows` per recipient ~<100ms; acceptable for Phase 1 volumes
- **`ReleaseRequiresReason` App Config key:** add via maker UI export-unpack-commit; tie to Group D deployment
- **Phase 1.5 verification gate for Group D:** confirm Heather + ops accept burned-sequence reality before Group D starts (Plan #10 prerequisite)
