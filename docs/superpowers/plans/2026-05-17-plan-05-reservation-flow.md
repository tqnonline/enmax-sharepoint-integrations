# Plan #05 — Reservation Flow + 3-Channel Notifications

**Date:** 2026-05-17
**Owner:** Engineering (Claude Code agent + one human reviewer: Rahul Akmol)
**Spec:** `2026-05-17-phase-1-cut-line-spec.md`
**PRD refs:** sections 5.1–5.2 (journeys), 10 (flows), 11 (notification UX), 12.4 (approve custom action), 36 (Appendix I templates)
**Decisions:** `2026-05-17-open-questions-decision-memo.md` (Q5 no-reply mailbox override applies)
**Estimated effort:** 16–20 hours
**Branch:** `feat/005-reservation-flow` → PR to `dev`
**Blocked by:**
- Plan #02 merged (Reservation, Drawing, Sheet, In-App Notification, Audit Event tables exist; App Config has `MaxDrawingsPerReservation`, `MaxSheetsPerDrawing`, `SharedMailboxAddress`)
- Plan #03 merged (`enmax_acdnIssueNumbers` custom action callable)
- Plan #04 merged (Code App shell + placeholder `/reserve` and `/approvals` routes exist; auth + App Config bootstrap in place)

## Context

This plan replaces the placeholder `/reserve` and `/approvals` pages with the real Reservation feature: a 4-step wizard for end users to request drawing numbers, a queue + side-panel UX for admins to approve or decline, and the 3-channel notification machinery (email, Teams 1:1 adaptive card, in-app bell) that fans out approval-needed and approval-result events. Numbers are issued atomically by the plan #03 plug-in at the moment of approval — never at reservation submit, never client-side.

After this plan merges, an end user can submit a reservation, the admin queue receives it via three channels, the admin approves, the plug-in issues the next sequence values, Drawing + Sheet rows are created in `PendingInitialUpload` state, and the requester is notified across all three channels. The requester can then go to the SharePoint library (URL surfaced) and upload PDFs — but the **check-in / revision-submit flow is plan #06's scope**. Plan #05 ends at "Drawing + Sheet rows created, requester notified".

This plan does **not** include the check-in flow, the revision-submit flow, force-checkin, search, my-items grids, or any broadcast/notification-feed UI beyond writing the In-App Notification rows that plan #04's bell panel will display.

## Prerequisites

- Plans #01–#04 merged to `dev`
- IssueNumbers plug-in deployed to dev tenant and passing concurrency test (per plan #03 verification)
- Service account has `Send As` on `noreply-autocad@tqnonline.onmicrosoft.com` (dev) and `noreply-autocad@enmax.com` (prod/UAT); confirmed in runbook #001
- Teams flow bot permitted to send 1:1 adaptive cards per Q2 decision (confirmed in runbook #008)
- At least one test user in each of the three Entra security groups (User, Approver, Admin) so the wizard + approval surfaces can be exercised end-to-end

## Out of Scope for This Plan

- Check-out flow, revision submit flow, check-in approval flow (plan #06)
- Force-checkin admin override (plan #06)
- Search grid (plan #07)
- My Items grid (plan #07) — the wizard's success screen surfaces issued numbers inline, but the persistent My Items view ships in #07
- Reference data editor, audit log viewer (plan #07)
- Broadcasts (plan #08)
- In-app notification bell feed *rendering* — the panel structure exists in plan #04; this plan writes the rows that feed it, but the full feed UX (mark-all-read, deep-link routing, grouping by Today/This week/Older) ships in plan #08

## Step 1 — `enmax_acdnApproveReservation` Custom Action

Per PRD section 12.4, approvers cannot directly write to Reservation rows — every state transition goes through a bound custom action so the platform enforces who can do what, the action emits a single Audit Event, and the downstream flow triggers from the same row update.

**Author in maker UI** (`https://make.powerapps.com/` → solution `enmaxautocadsln`):

| Property | Value |
|----------|-------|
| Unique name | `enmax_acdnApproveReservation` |
| Display name | `Approve or Decline Reservation` |
| Binding type | Entity (bound to `enmax_autocadreservation`) |
| Is function | No (mutates state) |
| Enabled for workflow | Yes |
| Allowed custom processing step | SyncAndAsync |
| Is private | No |

**Input parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `Decision` | OptionSet (`enmax_acdn_reservationstatus`, restricted to Approved/Declined values) | Yes | The decision; rejects values other than 2 (Approved) or 3 (Declined) |
| `Reason` | String (max 2000) | Conditional | Required when `Decision = Declined`; ignored when Approved |

**Output parameters:**

| Name | Type | Description |
|------|------|-------------|
| `ReservationId` | String | Echo for caller convenience |
| `NewStatus` | OptionSet | Final status written |

**Step registration:** The action does NOT use a plug-in. It is implemented entirely in a Power Automate flow that triggers on the action's `enmax_acdnApproveReservation` message. The flow updates the Reservation row's Status, Approver, ApprovedOn, and (if declined) DeclineReason columns, then exits. The row update then triggers the downstream issuance / notification flows (Step 5, Step 6).

**Why action-then-flow not plug-in:**
- The mutation is straightforward (no concurrency-critical math like IssueNumbers); no plug-in safety advantage
- Flow keeps logic visible to non-developer admins
- Plug-in pattern reserved for atomicity-critical paths (IssueNumbers, per CLAUDE.md Rule 14)

Export + unpack + commit per plan #02 discipline.

## Step 2 — Reserve Wizard (Code App)

Replaces `src/pages/Reserve.tsx` placeholder with the 4-step wizard from PRD section 5.1.

**Library choices:** React Hook Form + Zod resolver (already installed in plan #01 / plan #04), Fluent UI v9 `Steps` / custom stepper (Fluent v9 lacks a first-class stepper as of writing; use `<div role="tablist">` with custom styling per design.md).

**File tree:**

```
src/features/reserve/
├── ReservePage.tsx               # /reserve route entry; wraps wizard in shell command bar
├── ReserveWizard.tsx             # 4-step orchestrator + state
├── steps/
│   ├── Step1RecordType.tsx       # Drawing only in Phase 1 (auto-advance)
│   ├── Step2Composition.tsx      # 6 cascading dropdowns + live preview
│   ├── Step3Details.tsx          # Count, sheets-per-drawing, reason, override
│   └── Step4Review.tsx           # Confirmation pane with submit
├── ReserveSuccess.tsx            # Post-submit success view (shows pending state)
├── hooks/
│   ├── useReferenceData.ts       # Cached read of Business/Asset/Unit/Domain/System/Kind tables
│   ├── useApprovedCombinations.ts # Reads Approved BB-AA + Asset-Unit + System Scope; computes valid options
│   ├── usePreviewNumber.ts       # Pure: composes BB-AA-UU-DDD-SSS-KK-???? from current form state
│   └── useCreateReservation.ts   # React Query mutation: POST /enmax_autocadreservations
└── schema.ts                     # Zod schema for the wizard form
```

**`schema.ts`:**

```typescript
import { z } from "zod";

export const reserveSchema = z.object({
  recordType: z.literal("Drawing"),                 // Phase 1
  business:   z.string().min(1, "Business required"),
  asset:      z.string().min(1, "Asset required"),
  unit:       z.string().min(1, "Unit required"),
  domain:     z.string().min(1, "Domain required"),
  system:     z.string().min(1, "System required"),
  kind:       z.string().min(1, "Kind required"),
  count:      z.coerce.number().int().min(1).max(10), // upper bound from AppConfig.MaxDrawingsPerReservation
  sheetsPerDrawing: z.coerce.number().int().min(1).max(50),
  sequenceType: z.enum(["New", "Existing"]),
  reason:     z.string().min(10, "Reason must be at least 10 characters").max(2000),
  override:   z.boolean().default(false),
  overrideReason: z.string().max(2000).optional(),
}).refine(
  (data) => !data.override || (data.overrideReason && data.overrideReason.length >= 10),
  { message: "Override justification required (min 10 chars)", path: ["overrideReason"] },
);

export type ReserveForm = z.infer<typeof reserveSchema>;
```

**Step 2 cascading logic** (per PRD section 9.2 validation rules):

```
On Business change:
  → Filter Asset dropdown to assets where (Business, Asset) ∈ Approved BB-AA Combinations
  → If selected Asset no longer valid: clear it; show MessageBar "Selected Asset cleared because Business changed"
  → If (Business, Asset) is NOT in Approved combos AND user wants to proceed:
       expose "Use anyway with reason" override toggle (soft-validation override)

On Asset change:
  → Filter Unit dropdown to units where (Asset, Unit) ∈ Asset-Unit table
  → Same cascade rule on selection invalidation

On Asset OR Domain change:
  → Filter System dropdown using System Scoping Rules (PRD section 7.3)
  → AssetOnly rules: hide systems whose ScopeValue ≠ current Asset.Code
  → DomainOnly rules: hide systems whose ScopeValue ≠ current Domain.Code
```

**Live preview** (Step 2 footer + Step 4 confirmation): `BB-AA-UU-DDD-SSS-KK-????` where `????` literally renders as four `?` characters with a tooltip "Sequence number assigned at admin approval." This is critical UX — users must NOT see a placeholder number that looks issued.

**Soft-validation override UX:** when selected Business+Asset is NOT in Approved BB-AA, the cascading dropdowns still allow selection but Step 4 shows:

```
⚠ Validation override
The combination GG–XX is not in the approved list. Provide a justification for your supervisor:
[textarea required]
```

The override flag + reason go into the Reservation row; the approver sees them prominently in the queue side panel and on the adaptive card.

**Submit behaviour** (`useCreateReservation.ts`):

```typescript
const createReservation = useMutation({
  mutationFn: async (form: ReserveForm) => {
    // POST /api/data/v9.2/enmax_autocadreservations
    // Body: maps form fields to enmax_acdn* columns
    // Returns the created row with Reservation ID autonumber
    return await dataverse.create("enmax_autocadreservation", {
      "enmax_acdnrecordtype": 1,                              // Drawing
      "enmax_acdnbusiness@odata.bind": `/enmax_autocadbusinesses(${form.business})`,
      // ... etc
      "enmax_acdnstatus": 1,                                  // Pending
    });
  },
  onSuccess: (row) => {
    queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
    navigate(`/reserve/success?id=${row.enmax_acdnreservationid}`);
  },
});
```

**No `enmax_acdnIssueNumbers` call here.** Numbers issue at approval (Step 5 flow), not at reservation creation. The Reservation row sits in Pending state with composition data only.

## Step 3 — Approvals Queue + Side Panel (Code App)

Replaces `src/pages/Approvals.tsx` placeholder.

**File tree:**

```
src/features/approvals/
├── ApprovalsPage.tsx              # /approvals route entry (RequireRole={Approver,Admin})
├── ReservationQueueGrid.tsx       # Fluent DataGrid; pending reservations only
├── ReservationDetailPanel.tsx     # Side panel; opens on row click
├── BulkApproveDialog.tsx          # Multi-select confirmation dialog
├── DeclineDialog.tsx              # Decline-with-reason form (required, min 10 chars)
└── hooks/
    ├── usePendingReservations.ts  # React Query; reads Status=Pending; polls every 30s
    ├── useApproveReservation.ts   # React Query mutation: invokes enmax_acdnApproveReservation action
    └── useApprovalAudit.ts        # Surfaces who acted on similar past reservations (for context)
```

**Grid columns** (per PRD section 5.2 + PRD section 17 grid affordances):

| Column | Source | Notes |
|--------|--------|-------|
| Reservation ID | `enmax_acdnreservationid` | Sortable, default sort desc (newest first) |
| Requester | `_createdby_value` resolved to display name | Filter chip |
| Composition | Live-computed `BB-AA-UU-DDD-SSS-KK-????` | Read-only display |
| Count | `enmax_acdndrawingcount` | |
| Override | `enmax_acdnoverride` (Yes/No) | Severity icon (warning) when Yes |
| Reason | `enmax_acdnreason` | Truncated at 80 chars; full in panel |
| Submitted | `createdon` | Relative ("2 hours ago") |

**Standard grid affordances** (per plan #04 pattern): quick-search input, column sort, column filter chips, page-size selector, paging, column visibility menu, **no CSV export here** (approvals queue is transient; CSV export reserved for Search per PRD section 17).

**Side panel actions:**

| Action | Visibility | Behaviour |
|--------|-----------|-----------|
| Approve | Always | Calls `useApproveReservation({decision: "Approved"})`; closes panel on success; toast confirmation |
| Decline | Always | Opens `DeclineDialog`; reason required (min 10 chars); on submit calls action with `{decision: "Declined", reason}` |
| Open in new tab | Always | Opens full-screen Reservation detail page (deep link); useful for sharing with another admin |
| Audit history | Always (collapsed by default) | Lists past Audit Event rows for this reservation |

**Multi-select bulk approve:**

- Select 1..N rows in grid → "Approve selected (N)" button enables in command bar
- Click → `BulkApproveDialog` shows summary list with composed numbers + requesters
- Confirm → calls action sequentially for each (NOT in parallel — keeps audit log linear, avoids racing flows)
- Per-row success / failure surfaced in a results table; partial failure does NOT roll back the successful ones (Dataverse has no multi-row tx for actions)
- Bulk decline NOT supported — every decline requires a typed reason; bulk would require a batch reason which is bad UX. Approvers decline one at a time.

## Step 4 — Flow: `On Reservation Created → Notify Admins`

**Power Automate flow** (`solution/src/Workflows/On_Reservation_Created_Notify_Admins/`).

**Trigger:** Dataverse "When a row is added" → `enmax_autocadreservation`. Filter: `enmax_acdnstatus eq 1` (Pending).

**Flow steps:**

1. **Initialize variables:** `RequesterContext`, `CompositionPreview`, `DeepLink`
2. **Retrieve related rows:** Business, Asset, Unit, Domain, System, Kind (parallel branch with 6 lookups)
3. **Compose preview string:** `concat(Business.Code, '-', Asset.Code, '-', Unit.Code, '-', Domain.Code, '-', System.Code, '-', Kind.Code, '-????')`
4. **Compose deep link:** `concat('https://apps.powerapps.com/play/', envId, '/', appId, '?path=approvals/', triggerOutputs().body['enmax_acdnreservationid'])` — `envId` and `appId` from env vars
5. **List admin + approver team members:** Two parallel `List rows` calls on `teammemberships` filtered by team ID; merge results, dedupe
6. **For each recipient (apply to each):**
   - **Send email** via child flow `Send_Approval_Needed_Email` (Step 7) with recipient address + payload
   - **Post adaptive card to user** via Teams Power Automate bot's `Post adaptive card and wait for a response` action (one-to-one chat)
   - **Create In-App Notification row** in `enmax_autocadinappnotification` with:
     - Recipient = current loop user
     - Title = "Reservation pending: {{ReservationId}}"
     - Body = "{{Requester}} requested {{Count}} drawing(s): {{CompositionPreview}}"
     - Severity = Warning (2)
     - SourceEvent = (not in option set; add `1=ReservationPending` to `enmax_acdn_sourceevent` if missing — confirm with plan #02 option set Step 2)
     - SubjectTable = `enmax_autocadreservation`, SubjectId = ReservationId
     - DeepLinkPath = `approvals/{{ReservationId}}`
7. **Adaptive card response handler** (the "wait for" branches the flow):
   - If response `verb = approve` → invoke `enmax_acdnApproveReservation` action on the Reservation row with `Decision = Approved`
   - If response `verb = decline` → prompt for reason (Teams card response inputs include a textarea), then invoke action with `Decision = Declined, Reason = inputs.reason`
   - The action's downstream flows (Step 5 / Step 6) then fire
8. **Log Audit Event:** `Event = Created`, `Source = Flow`, `ActedBy = service account`, `ActedOnBehalfOf = Requester`

**Idempotency note:** the "wait for response" pattern means the flow can run for hours waiting for admin action. Power Automate has a 30-day max wait. Within that window, the flow remains active per recipient. Admin acting via the in-app Approvals grid (which calls the action directly) does NOT cancel pending Teams cards — they show "Already decided" if pressed afterward, courtesy of action idempotency (Step 1 custom action rejects state transitions on non-Pending rows).

**Retry policy:** default Power Automate retry (4 retries, exponential) on every Dataverse action. Email send failures retry once then write to flow's error queue for IT triage.

## Step 5 — Flow: `On Reservation Approved → Issue Drawings and Sheets`

**Trigger:** Dataverse "When a row is updated" → `enmax_autocadreservation`. Filter: `enmax_acdnstatus eq 2 and _modifiedby_value ne '<service-account-userid>'` (Approved AND not service-account-modified). *Trigger-level filter prevents loop without burning a flow run per architecture review Finding 5.5.*

**Flow steps:**

1. **Pre-validate batch capacity (added 2026-05-18 per architecture review Finding 5.3):**
   - Query target Number Sequence row by composed Sequence Key
   - Assert `LastIssued + Reservation.Count ≤ 9999` — if not, exit early with admin notification; Reservation reverts to Pending; no sequence values burned
   - Assert `Reservation.DrawingCount × Reservation.SheetsPerDrawing ≤ 1000` (sanity cap to avoid runaway loops)
   - Assert SharePoint Library URL is populated on the target Asset-Unit row — if null, exit early with admin notification; reservation reverts to Pending; admin runs library provisioning before re-approving
   - **Note:** pre-validation reduces likelihood of mid-loop failure but does not eliminate it (transient Dataverse outages remain). Residual risk accepted per project decision 2026-05-18 (alternative: full compensating action rejected for complexity).
2. **Retrieve related rows** (Business, Asset, Unit, Domain, System, Kind)
3. **Invoke `enmax_acdnIssueNumbers` custom action** (plan #03):
   - Inputs: 6 segment codes + Count from the Reservation row
   - Output: `IssuedNumbers` (JSON array, e.g. `[42, 43, 44]`)
4. **Parse IssuedNumbers** into array
5. **For each issued number (apply to each, NOT parallel to keep Sheet creation in order):**
   - **Create Drawing row** in `enmax_autocaddrawing`:
     - ENMAX Number = `concat(Business.Code, '-', ..., '-', formatNumber(currentItem, '0000'))`
     - All 6 segment lookups + Sequence Number = currentItem
     - Title = "(pending)" (user edits when uploading)
     - State = 2 (Available) — drawings are immediately available; sheets carry the PendingInitialUpload state
     - Owner Reservation = trigger row ID
     - SharePoint Library URL = looked up from Asset-Unit table by (Asset, Unit) — surfaced for the requester to upload to
   - **For sheet number 1..Reservation.SheetsPerDrawing (nested apply to each):**
     - **Create Sheet row** in `enmax_autocadsheet`:
       - Drawing = parent Drawing GUID
       - Sheet Number = current sheet index
       - Filename = `concat(ENMAXNumber, '-', formatNumber(sheetIndex, '000'), '.pdf')` (deterministic)
       - SharePoint URL = null (filled by plan #06 revision-submit indexing)
       - State = 1 (PendingInitialUpload)
6. **Update Reservation.IssuedNumbers** column with the JSON array (for audit/display)
7. **Notify requester** across 3 channels:
   - **Email** via child flow `Send_Approval_Result_Email` with template 36.2 (Approved)
   - **Teams card** (1:1) with summary: "Approved: {{ReservationId}} — Numbers issued: {{IssuedRange}}"
   - **In-App Notification row** for requester
8. **Log Audit Event:** `Event = ApprovalGranted`, `Source = Flow`, `ActedBy = approver`, From State = Pending, To State = Approved
9. **Log issuance audit:** per-Drawing Audit Event `Event = Created` for traceability

**Failure handling:**
- If IssueNumbers throws (e.g. ceiling exceeded): flow surfaces error, **reverts Reservation back to Pending** (writes Status = Pending + appends note to Reason field), notifies admin via 3 channels with "Approval failed: sequence exhausted" payload
- If Drawing/Sheet creation partial-fails: log audit, surface to admin; do NOT retry automatically (numbers are issued, partial drawings exist — needs manual recovery via Administration model-driven app)

**Why per-number serial create:** Drawing autonumber doesn't apply (we use ENMAX Number as the unique key); creating in order keeps audit log linear and avoids any chance of race against duplicate-key check.

## Step 6 — Flow: `On Reservation Declined → Notify Requester`

**Trigger:** Dataverse "When a row is updated" → `enmax_autocadreservation`. Filter: `enmax_acdnstatus eq 3 and _modifiedby_value ne '<service-account-userid>'` (Declined AND not service-account-modified). *Trigger-level filter per architecture review Finding 5.5.*

**Flow steps:**

1. ~~Guard: ignore if `_modifiedby_value` is service account on re-replay~~ *(now enforced at trigger filter — no inline guard needed per Finding 5.5)*
2. **Notify requester** across 3 channels:
   - **Email** via child flow `Send_Approval_Result_Email` with template 36.3 (Declined) + DeclineReason from row
   - **Teams card** (1:1): "Declined: {{ReservationId}} — Reason: {{Reason}}"
   - **In-App Notification row** for requester w/ deep link to `/my-items/reservations/{{ReservationId}}` (deep-link target is the My Items page placeholder until plan #07)
3. **Log Audit Event:** `Event = ApprovalDenied`, From State = Pending, To State = Declined, Reason = DeclineReason

## Step 7 — Child Flow: `Send_Approval_Needed_Email` + `Send_Approval_Result_Email`

Two child flows in `solution/src/Workflows/Child_Send_Approval_Needed_Email/` and `Child_Send_Approval_Result_Email/`.

**Why two not one:** templates differ enough (subject, body, CTA buttons) that one flow with a switch is harder to maintain than two flows with one purpose each. Compositionally identical infrastructure (same shared mailbox send action), distinct template payloads.

**Inputs (both):**
- `RecipientEmail` (string)
- `RecipientDisplayName` (string)
- `ReservationId` (string)
- `Payload` (JSON; fields vary per template)
- `DeepLink` (string)

**Send action:** `Office 365 Outlook → Send an email from a shared mailbox (V2)` with:
- `Mailbox Address` = `@{first(body('List_App_Config')?['value'])?['enmax_acdnvalue']}` where the List query reads the `SharedMailboxAddress` App Config row at start of flow (cacheable since immutable per env)
- `To` = RecipientEmail
- `Subject` = composed per template
- `Body` (HTML) = mustache-substituted template (Step 8)
- `Importance` = Normal
- `Is HTML` = Yes

**Inline approve/decline:** the Outlook actionable-messages schema is appended to the HTML body's `<head>` as a `<script type="application/ld+json">` block per [MS actionable-messages docs](https://learn.microsoft.com/en-us/outlook/actionable-messages/). Sender VerifiedActionable trust is registered via the Actionable Email Developer Dashboard (one-time, runbook #009 addendum).

## Step 8 — Email Templates (with Q5 No-Reply Override)

Per PRD Appendix I + cut-line spec Q5 override (no-reply mailbox; email copy must not invite replies).

**Subject + body** (Mustache-style; child flow substitutes via `replace()` expression):

### Template A: `approval_needed.html`

```
Subject: Reservation pending: {{ReservationId}}: {{CompositionPreview}}

Body (HTML):
A new drawing number reservation is awaiting your approval.

  Requested by : {{RequesterDisplayName}} ({{RequesterEmail}})
  Reason       : {{Reason}}
  Composition  : {{CompositionPreview}}
  Count        : {{Count}}
  Override     : {{OverrideText}}     <!-- "Yes: {reason}" or "No" -->

[Approve]   [Decline]   [Open in app →]

Reference: {{ReservationId}}

---
This message was sent from a no-reply address. Replies are not monitored.
To respond, open the application: {{AppUrl}}
```

### Template B: `approval_approved.html`

```
Subject: Approved: {{ReservationId}}: {{IssuedRange}}

Body:
Your reservation has been approved.

  Numbers issued : {{IssuedNumbersFormatted}}     <!-- e.g. "0042, 0043, 0044" -->
  Approved by    : {{ApproverDisplayName}}
  Approved on    : {{ApprovedOnFormatted}}        <!-- "17 May 2026 14:32 MT" -->

Next step: upload your PDFs to the SharePoint library:
{{SharePointLibraryUrl}}

[Open in app →]

---
This message was sent from a no-reply address. Replies are not monitored.
To respond or get help, contact the document controller via the app.
```

### Template C: `approval_declined.html`

```
Subject: Declined: {{ReservationId}}

Body:
Your reservation has been declined.

  Reason : {{DeclineReason}}
  By     : {{ApproverDisplayName}}

You can edit and resubmit:
[Edit and resubmit →]

---
This message was sent from a no-reply address. Replies are not monitored.
To discuss the decision, contact the approver via Teams.
```

**Note on PRD divergence:** PRD section 11.1 says "replies route back to it [shared mailbox] and are visible to every admin and approver". Q5 override supersedes — shared mailbox is now `noreply-autocad@*`, replies are not monitored. Cut-line spec records this. Future Phase 2 reconsideration of the mailbox identity will require re-evaluating whether to invite replies.

**Templates stored:** as solution Web Resource files under `solution/src/WebResources/email_templates/`. Child flow reads via `Get Web Resource` action at runtime; allows updates without redeploying the flow.

## Step 9 — Adaptive Card Template

`solution/src/WebResources/adaptive_cards/approval_needed_card.json` per PRD section 36.4. No Q5 override needed (cards don't invite replies). Use Adaptive Card schema 1.5.

**One difference from PRD 36.4:** add a textarea input for decline reason inside the card so decline-with-reason is a single round-trip:

```json
"actions": [
  { "type": "Action.ShowCard", "title": "Decline",
    "card": {
      "type": "AdaptiveCard",
      "body": [
        { "type": "Input.Text", "id": "declineReason", "isMultiline": true,
          "placeholder": "Reason (min 10 chars)", "isRequired": true,
          "errorMessage": "Reason required (min 10 chars)" }
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

Flow's adaptive-card response handler reads `body.declineReason` when `verb=decline`.

## Step 10 — In-App Notification Writes

Every step that fans out email + Teams also writes an `enmax_autocadinappnotification` row per recipient. Plan #04 bell panel reads these rows and badges the unread count.

**Helper composition** (Power Automate doesn't have user-defined functions, so this is repeated inline per loop iteration):

```
Title:     concat(Action, ': ', ReservationId)        // "Reservation pending: RES-00042"
Body:      <copy from email body, plain-text variant>
Severity:  Warning for "pending" (admin action needed); Success for "approved"; Critical for "declined"
SourceEvent: enum from option set per Step 1 (ReservationPending=add to enum, ReservationApproved=1, ReservationDeclined=2)
SubjectTable: enmax_autocadreservation
SubjectId:    ReservationId
DeepLinkPath: approvals/{{ReservationId}}  (admin) OR my-items/reservations/{{ReservationId}} (requester)
Read:         false
```

**Idempotency:** the fan-out flow checks for an existing In-App Notification with the same `(Recipient, SubjectId, SourceEvent)` triple before creating; re-runs do not duplicate. Critical for the "wait for adaptive card response" flow pattern that may re-enter on platform retries.

## Step 11 — Tests

**Code App side (Vitest + RTL):**

| # | Test | Asserts |
|---|------|---------|
| 1 | Wizard step 2 cascading: Asset filter on Business change | Selecting different Business → Asset options re-render filtered |
| 2 | Wizard step 2 override toggle appears for invalid BB-AA | Step 4 surfaces override + requires justification |
| 3 | Wizard step 4 live preview renders `????` placeholder | Tooltip "Sequence number assigned at admin approval" present |
| 4 | Zod schema rejects count > MaxDrawingsPerReservation | |
| 5 | Zod schema rejects reason < 10 chars | |
| 6 | Override reason required when override=true | Form-level validation error |
| 7 | Submit calls Dataverse create with mapped columns | MSW mock asserts POST body shape |
| 8 | Submit navigates to success page on 201 | |
| 9 | Submit surfaces error toast on 403 (permission denied) | Defensive UX |
| 10 | Approvals queue hides for User role | RequireRole behaviour from plan #04 |
| 11 | Approvals queue shows pending only (no Approved/Declined) | Filter by Status=Pending |
| 12 | Side panel decline requires reason min 10 chars | |
| 13 | Bulk approve calls action N times sequentially | Mock assert call count + ordering |
| 14 | Bulk decline button NOT present in command bar | Multi-select decline disallowed (Step 3 design decision) |

**Power Automate / Dataverse side (integration; runs in `cd-dev.yml` against real dev tenant):**

| # | Test (xUnit C# or Playwright API-only) | Asserts |
|---|---|---|
| 1 | Create Reservation row → flow fires within 30s | Service-account log entries; admin In-App Notification rows appear |
| 2 | Invoke ApproveReservation action → IssueDrawings flow runs | Drawing + Sheet rows created in expected counts; status transitions logged |
| 3 | Invoke ApproveReservation action with Declined + Reason → Decline flow fires | Requester In-App Notification appears; email send action invoked (mock SMTP) |
| 4 | IssueNumbers ceiling exceeded → flow reverts Reservation to Pending + admin notified | End-to-end failure recovery |
| 5 | Adaptive card response handler accepts Approve | Verb=approve → custom action invoked with Approved |
| 6 | Adaptive card response handler accepts Decline with reason | Verb=decline + reason → custom action invoked with Declined + reason |

**Email template snapshot tests** (Vitest): render template against fixture payload, snapshot-compare against committed reference output. Catches accidental template drift in `solution/src/WebResources/email_templates/*.html`.

## Verification — End-to-End Checklist

```powershell
# Code App tests
Set-Location apps/code-app
npm test -- src/features/reserve src/features/approvals     # all 14 component tests pass
npx playwright test src/features/reserve src/features/approvals    # a11y violations zero

# Build + push
npm run build
npx power-apps push --environmentId $env:DEV_POWER_APPS_ENV_ID

# Solution: pack + import
Set-Location ../..
python solution/scripts/pack.py
python solution/scripts/import.py     # imports custom action, 4 flows, 2 child flows, web resources

# Manual end-to-end smoke (3 test accounts: User, Admin, second Admin acting as Approver)
#
# 1. As User:
#    - Open app → Reserve → wizard 4 steps → submit "Count=3, reason='test reservation per plan #05'"
#    - Success page shows Reservation ID (RES-NNNNN) and "pending approval" status
#
# 2. As Admin (3 surfaces):
#    a. Open email inbox of noreply-autocad@... shared (via shared inbox or impersonation)
#       Wait — emails go OUT from shared mailbox, not in. Admin receives at their own enmax.com address.
#       Confirm email arrives with subject "Reservation pending: RES-NNNNN: GG-CG-00-ECS-AST-DD-????"
#       Approve via inline button (actionable message) → expect "Action received" confirmation
#    b. Open Teams personal chat → adaptive card present → click Decline → enter reason → confirm
#       Expect "Already decided" if a. already approved
#    c. Open Code App → /approvals → row visible (if not yet approved) → multi-select → Approve
#
# 3. As User (or via My Items in #07 once shipped):
#    - Query Reservation row in Administration model-driven app
#    - Status = Approved, IssuedNumbers = "[1,2,3]" (or whatever range)
#    - Drawing rows created (3 rows) with ENMAX Numbers "GG-CG-00-ECS-AST-DD-0001/0002/0003"
#    - Sheet rows created (3 drawings × 1 sheet each = 3 sheets) with deterministic filenames
#    - Email arrived: "Approved: RES-NNNNN: 0001-0003"
#    - In-App Notification row exists for requester (visible in bell panel from plan #04)

# CI verification
git push -u origin feat/005-reservation-flow
gh pr create --base dev --title "feat(reservation): reserve wizard + approvals + 3-channel flows per plan #05"
gh pr checks                                          # ci.yml green
```

**Acceptance:**
- All 14 Code App component tests + 6 integration tests pass
- End-to-end smoke completes successfully against dev tenant
- Reservation can be approved via any of 3 surfaces (email, Teams, in-app grid) with same outcome
- Decline-with-reason works from all 3 surfaces; reason appears verbatim in requester notification
- Plug-in concurrency test still passes (plan #03 regression check)
- PR reviewed by Rahul and squash-merged to `dev`

## Critical Files to Read Before Starting

| File | Why |
|------|-----|
| PRD sections 5.1, 5.2, 10, 11.1–11.4, 12.4, 36 | Authoritative journey, flow list, notification anatomy, action permissions, templates |
| `2026-05-17-phase-1-cut-line-spec.md` | Q5 no-reply override; in-scope vs deferred to plan #06+ |
| `2026-05-17-plan-03-issuenumbers-plugin.md` Custom Action Signature section | Inputs/outputs of `enmax_acdnIssueNumbers` (called from Step 5 flow) |
| `2026-05-17-plan-04-code-app-shell.md` | Placeholder pages to replace; RequireRole / Suspense patterns to reuse |
| [MS Learn: Actionable messages](https://learn.microsoft.com/en-us/outlook/actionable-messages/) | Email actionable schema; sender registration |
| [Adaptive Cards 1.5 schema](https://adaptivecards.io/explorer/) | Card JSON authoring; Action.ShowCard nesting |

## Downstream Plans Unblocked by This Plan

| Plan | Unblocked? | Why |
|------|------------|-----|
| #06 Check-Out / Check-In | Yes | Drawing rows exist in Available state with SharePoint Library URL surfaced; #06 implements the user flow that takes a Drawing → CheckedOut → AwaitingValidation → CheckedIn |
| #07 Search + admin surfaces | Yes | Drawing + Sheet + Audit Event rows now produced; grids have something real to show. My Items grid renders user's own Reservations + Drawings + Checkouts |
| #08 Broadcast + notifications | Partial | In-App Notification rows are now being written; #08 builds the full bell-panel feed UX (mark-all-read, grouping, deep-link routing) and the broadcast banner |
| #09 UAT promotion | No | Blocked on feature completeness through #08 |

## Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| Teams adaptive card "wait for response" pattern flakes on platform retries | Idempotency guard in Step 10 (check existing In-App Notification before create); custom action rejects state transitions on non-Pending rows (Step 1); admins see "Already decided" rather than ghost cards |
| Email actionable-message registration not approved by Microsoft for noreply-autocad sender | Fallback: emails ship without inline buttons; recipients click "Open in app →" instead. Document at runbook #009 addendum; non-blocking for Phase 1 ship since 2 of 3 channels remain (Teams + in-app) |
| Concurrent multi-select approve causes plug-in retries to spike | Bulk approve loop is sequential (Step 3 design); rate-limited at ~10 approvals/second by Dataverse action throttling. Real-world admin pace nowhere near this. |
| SharePoint Library URL not yet populated on Asset-Unit row when first reservation approves for that combo | Step 5 flow guards: if `_enmax_acdnsplibraryurl_value is null`, exit with admin notification "SharePoint library not provisioned for Asset-Unit X-Y; run provisioning flow (plan #06) before approving"; Reservation reverts to Pending; admin re-approves after IT completes runbook. |
| Mustache template substitution misses an escape and renders raw HTML | Sanitise every templated string via `coalesce(replace(replace(value, '<', '&lt;'), '>', '&gt;'), '')` in flow expressions; document the pattern. Snapshot tests on templates catch regressions. |
| Approve action invoked twice (double-click race) creates duplicate Drawings | Reservation status custom action transition: first call moves Pending → Approved; second call sees Approved and exits (per Step 1 idempotency rule). Drawings only created if status was actually transitioned. |
| IssuedNumbers JSON over 2000 chars (Count = 1000 hypothetical) | Per AppConfig.MaxDrawingsPerReservation default=10, this is well within column limits. Plug-in's 1000 hard cap (plan #03) is the real ceiling; JSON for 1000 ints fits in ~5KB which fits in multiline text |
| Power Automate flow exceeds 30-day max wait on adaptive card response | Acceptable: an admin who hasn't acted in 30 days has bigger problems. Stale flow is logged for cleanup. Email + in-app remain valid paths. |
| Service account hits Dataverse API daily request cap (40K/day for non-licensed users) | Service account is licensed per runbook #001. Flow runs at ~5 API calls per reservation × ~50 reservations/day = 250 calls/day. Well within cap. |

## TODOs Left in This Plan

- **Add `ReservationPending` to `enmax_acdn_sourceevent` option set** if missing from plan #02's Step 2 inventory. Verify and add via maker UI; export + unpack + commit per discipline.
- **Outlook actionable-messages sender registration:** runbook #009 addendum. One-time setup; not on critical path for first dev-tenant smoke (Teams + in-app cover approval surface).
- **Mustache substitution helper module:** the inline `replace(replace(...))` pattern in flows is verbose. Consider a shared Power Automate expression library or a JavaScript Custom Connector for substitution. Defer to a small follow-up plan if template count grows beyond Phase 1's 3 reservation templates.
- **My Items deep link target:** Step 6 decline notification links to `/my-items/reservations/{{ReservationId}}` which doesn't exist until plan #07. Until then the deep link lands on the My Items placeholder page from plan #04. Document for QA so the broken-looking link isn't flagged as a bug.
