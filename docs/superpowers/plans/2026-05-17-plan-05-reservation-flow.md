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

**Already implemented as C# plugins.** `ApproveReservationPlugin` and `DeclineReservationPlugin` are registered as unbound Custom APIs per runbook #010. The flow-based approach originally described here was superseded. No flow development needed for these actions — see runbook #010 for registration details.

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

## Steps 4–10 — Deferred to Plan #11

All Power Automate flow work has been moved to **Plan #11 — Power Automate Flows** (`2026-05-20-plan-11-power-automate-flows.md`):

| Original step | Plan #11 section | Description |
|---|---|---|
| Step 4 | A1 | Flow `On Reservation Created → Notify Admins` |
| Step 5 | A2 | Flow `On Reservation Approved → Issue Drawings and Sheets` |
| Step 6 | A3 | Flow `On Reservation Declined → Notify Requester` |
| Step 7 | A4 | Child flows `Send_Approval_Needed_Email` + `Send_Approval_Result_Email` |
| Step 8 | A5 | Email templates A, B, C |
| Step 9 | A6 | Adaptive card template |
| Step 10 | A7 | In-App Notification write patterns |

Flow development is deferred until non-flow work from Plans #05–#10 is merged.

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

**Integration tests (flow-dependent):** moved to Plan #11 Tests section (tests 1–6). Run after flows are deployed.

## Verification — End-to-End Checklist

```powershell
# Code App tests
Set-Location apps/code-app
npm test -- src/features/reserve src/features/approvals     # all 14 component tests pass
npx playwright test src/features/reserve src/features/approvals    # a11y violations zero

# Build + push
npm run build
npx power-apps push --environmentId $env:DEV_POWER_APPS_ENV_ID

# CI verification
git push -u origin feat/005-reservation-flow
gh pr create --base dev --title "feat(reservation): reserve wizard + approvals per plan #05"
gh pr checks                                          # ci.yml green
```

**Acceptance:**
- All 14 Code App component tests pass
- Reserve wizard submits a Reservation row (Pending status) correctly
- Approvals queue shows pending reservations; approve/decline calls action and transitions status
- Plug-in concurrency test still passes (plan #03 regression check)
- PR reviewed by Rahul and squash-merged to `dev`

**Note:** Full end-to-end smoke (email/Teams notifications, Drawing/Sheet row creation) requires flows from Plan #11 to be deployed first.

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
