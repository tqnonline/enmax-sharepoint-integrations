# Plan #08 — Broadcasts, Notification Feed, Home Dashboard

**Date:** 2026-05-18
**Owner:** Engineering (Claude Code agent + one human reviewer: Rahul Akmol)
**Spec:** `2026-05-17-phase-1-cut-line-spec.md`
**PRD refs:** sections 4 (F-33, F-34, F-35), 6 (Home), 7 (Broadcast schema), 10 (fan-out flow), 11.3 (in-app channel UX)
**Decisions:** `2026-05-17-open-questions-decision-memo.md`
**Estimated effort:** 14–18 hours
**Branch:** `feat/008-broadcast-and-notifications` → PR to `dev`
**Blocked by:**
- Plans #01–#07 merged to `dev`
- EnmaxDataGrid from plan #07 available for Broadcasts grid
- Bell panel structure from plan #04 ready for feed wiring
- In-App Notification rows being written by plans #05/#06 (data flowing)

## Context

This plan delivers the third notification channel's full UX (the in-app feed inside plan #04's bell panel structure), the admin Broadcast authoring + grid, the broadcast banner on the Home dashboard, the hourly fan-out flow that materialises broadcasts into per-user In-App Notification rows, and a new Critical-threshold broadcast trigger that surfaces Number Sequences nearing 9999.

It also replaces plan #04's Home placeholder with the real personal dashboard per PRD section 6: recent activity, pending approvals (admin), open check-outs, recent reservations, quick actions, and active broadcasts.

After this plan merges, every Phase 1 feature is shipped. Plan #09 (UAT promotion) is purely runbook execution + the deployment-rehearsal smoke.

This plan does **not** ship: any new transactional feature (reservation/check-out/etc.); UAT promotion (plan #09).

## Prerequisites

- All prior plans merged
- Broadcast, Broadcast Dismissal, In-App Notification tables exist (plan #02)
- In-App Notification rows being written by plans #05/#06 flows (test users have non-empty feeds)
- AppConfig.BroadcastFanOutCadenceMinutes = 60 (plan #02 seed)

## Out of Scope for This Plan

- UAT promotion (plan #09)
- Phase 2 reporting (Power BI dashboards over Audit Event)
- Push notifications (no mobile per F-30)
- Email digest of in-app notifications (defer to Phase 2 if request emerges)

## Step 1 — Broadcast Author UI (`/broadcasts`)

Per F-34. Admin-only (RequireRole={Admin}). Replaces plan #04 placeholder.

**Layout:** Master-detail. Left = EnmaxDataGrid of broadcasts; Right = side panel for create/edit.

**Grid columns:**

| Column | Source |
|--------|--------|
| Status | `enmax_acdnstatus` (Draft/Scheduled/Active/Expired/Retired) w/ severity icon |
| Title | `enmax_acdntitle` |
| Severity | `enmax_acdnseverity` (Info/Warning/Critical) |
| Audience | `enmax_acdnaudience` (multi-select; renders as chip list) |
| Starts At | `enmax_acdnstartsat` |
| Expires At | `enmax_acdnexpiresat` |
| Requires Ack | `enmax_acdnrequiresack` |
| Pinned | `enmax_acdnpinned` |
| Author | `_enmax_acdnauthor_value` |
| Dismissal stats | Computed count from Broadcast Dismissal table; "X / Y dismissed" |

**Default sort:** Status (Active first), then Starts At desc.

**Command bar:**
- Create New Broadcast
- Edit (single-select)
- Retire (single-select; sets Status=Retired; visible to no one going forward)
- Delete (Draft only; hard-delete since never published)

**Create / Edit side panel form fields:**

| Field | Type | Validation |
|-------|------|------------|
| Title | Text | Required, 5–120 chars |
| Body | Markdown textarea | Required, 10–4000 chars; live preview |
| Severity | Select | Info / Warning / Critical |
| Audience | Multi-select | Users / Approvers / Admins / Everyone; at least one |
| Starts At | DateTime | Default = now; cannot be > 1 year future |
| Expires At | DateTime | Required, > Starts At, ≤ 1 year from Starts At |
| Requires Acknowledgement | Yes/No | Default No |
| Pinned | Yes/No | Default No; when Yes appears at top of Home dashboard for every targeted user |

**Markdown rendering:** `react-markdown` w/ allow-list (h1-h3, p, strong, em, ul, ol, li, a, code, blockquote). No HTML passthrough. No images (security; Power Apps Code App CSP forbids arbitrary external resources).

**Author binding:** `enmax_acdnauthor` set to current user on Create; immutable thereafter.

**Status transitions:**
- Draft on Create
- → Scheduled when StartsAt > now
- → Active when StartsAt ≤ now < ExpiresAt
- → Expired when ExpiresAt ≤ now
- → Retired when admin explicitly retires (manual)

Transitions computed by a scheduled flow (Step 4) running nightly + on every Broadcast row edit (trigger flow at end of edit dialog).

## Step 2 — Broadcast Fan-Out Flow

Per PRD section 10 `ENMAX AutoCAD: On Broadcast Published → Fan Out In-App Notifications`.

**Trigger:** Two triggers (Power Automate supports multi-trigger in v3):
1. Dataverse "When a row is created or updated" on `enmax_autocadbroadcast`. **Filter: `_modifiedby_value ne '<service-account-userid>'`** (excludes status-compute flow re-writes per architecture review Anti-Pattern #3) — admin edits only fire fan-out, not platform recursions.
2. Scheduled recurrence every `AppConfig.BroadcastFanOutCadenceMinutes` (60 by default)

**Steps:**

1. **List active broadcasts:** `Status=Active AND StartsAt ≤ now AND ExpiresAt > now`
2. **For each active broadcast:**
   - **Resolve audience users:** for each Audience value in the broadcast:
     - Users → team `team-enmax-autocad-users` membership
     - Approvers → `team-enmax-autocad-approvers`
     - Admins → `team-enmax-autocad-admins`
     - Everyone → union of all three
   - **For each user in audience:**
     - **Check existing In-App Notification:** `Recipient=user AND SubjectTable=enmax_autocadbroadcast AND SubjectId=broadcastId`
     - If exists → skip (idempotent per PRD)
     - If not → create In-App Notification row:
       - Title = Broadcast.Title
       - Body = Broadcast.Body (truncated to 500 chars; full body in panel expansion)
       - Severity = Broadcast.Severity
       - SourceEvent = `BroadcastPublished` (6 per plan #02 Step 2 option set)
       - SubjectTable = `enmax_autocadbroadcast`
       - SubjectId = broadcastId
       - DeepLinkPath = `broadcasts/{broadcastId}` (admin) or `/?broadcast={broadcastId}` (end users — opens Home with broadcast pinned)
       - Read = false
3. **Audit Event** per fan-out run: `Event=Created`, `Source=Flow`, `Reason="BroadcastFanOut: {broadcastCount} broadcasts × {userCount} users = {createdCount} rows"`

**Idempotency:** the existence-check in step 2 prevents duplicates. Re-running every hour is safe; new users added to a security group post-broadcast-activation pick up the broadcast at next run.

**Performance:** worst case = 1 broadcast × 670 users = 670 row checks + ≤670 creates. Run completes in <30s. Dataverse API quota safely within 40K/day for service account (1 fan-out run = ~1400 calls; 24 runs/day = ~33K).

## Step 3 — Bell Panel Feed (full UX)

Replaces plan #04's empty `NotificationBell.tsx` panel stub with full feed.

**File:** `src/app/NotificationFeedPanel.tsx`

**Query:** `useNotificationFeed()` React Query hook
- Filter: `_enmax_acdnrecipient_value = currentUserId`
- Sort: `createdon desc`
- Limit: 50 most recent (older accessible via "Load more")
- Poll cadence: **React Query `refetchOnWindowFocus: true` + 5-minute keepalive interval** *(was 30s; updated 2026-05-18 per architecture review Finding 5.4 to reduce idle-tab API load by ~10x)*. PRD section 6 "30-second background refresh" superseded — notification freshness on tab-focus is the dominant UX moment; idle tabs revalidate every 5 min as a safety net.

**Layout (per PRD section 11.3):**

```
┌─ Notifications ─────────────────────[Mark all read]┐
│                                                     │
│ ── Today ───────────────────────────────────────── │
│ ⚠ Reservation pending: RES-00042                   │
│   GG-CG-00-ECS-AST-DD-???? × 3                     │
│   5 minutes ago                              [×]   │
│                                                     │
│ ✓ Approved: RES-00041                              │
│   Numbers issued: 0001, 0002, 0003                 │
│   2 hours ago                                [×]   │
│                                                     │
│ ── Earlier this week ──────────────────────────── │
│ ℹ Broadcast: Maintenance scheduled                 │
│   Sunday 0200-0400 MT                              │
│   2 days ago                          [Acknowledge]│
│                                                     │
│ ── Older ──────────────────────────────────────── │
│ ...                                                 │
│                                                     │
│ [Load more]                                         │
└─────────────────────────────────────────────────────┘
```

**Grouping rules:**
- Today: `createdon ≥ startOfDay(now)`
- Earlier this week: `createdon ≥ startOfWeek(now)` and not Today
- Older: anything else

**Per-item UX:**
- Severity icon (Info/Success/Warning/Critical) w/ Fluent theme accent
- Title + body two-line truncated; click "More" to expand
- Relative timestamp ("5 minutes ago"); full ISO on hover via title attribute
- Click row → mark as read + navigate to DeepLinkPath
- × dismiss button (per-row Mark Read; doesn't delete row, just sets Read=true)
- Broadcasts w/ `RequiresAcknowledgement=true`: × replaced by [Acknowledge] button → on click writes Broadcast Dismissal row w/ Acknowledged=true

**Mark all read:**
- Bulk update: PATCH every Read=false row owned by current user → Read=true, ReadOn=now
- Optimistic UI update; rollback on failure
- Audit Event written for the bulk action

**Bell badge:** unread count from `useNotificationFeed`; clamped at 99+ visual cap.

**Empty state:** "You're all caught up." w/ Fluent v9 illustration.

## Step 4 — Broadcast Status Computation Flow

**Trigger:** Scheduled daily 00:30 MT + Dataverse "When a row is updated" on `enmax_autocadbroadcast` (immediate transition on admin edit).

**Steps:**

1. **List all broadcasts in Draft/Scheduled/Active/Expired statuses** (excludes Retired):
2. **For each:**
   - If StartsAt > now → Status=Scheduled
   - Else if ExpiresAt > now → Status=Active
   - Else → Status=Expired
3. **Update row** if Status changed
4. **Trigger fan-out flow** (Step 2) on Status=Active transitions

## Step 5 — Home Dashboard

Replaces plan #04's `Home.tsx` placeholder. Per PRD section 6 ("Personal dashboard: recent activity, pending approvals (if admin), open check-outs, recent reservations, quick actions").

**Layout: 4-card responsive grid.**

```
┌─ Pinned Broadcasts ────────────────────────────────┐
│ (one card per active pinned broadcast targeted at  │
│  current user; sorted by Severity desc then        │
│  StartsAt desc; dismissible if not RequiresAck)    │
└─────────────────────────────────────────────────────┘

┌─ Quick Actions ─────────┐ ┌─ Pending Approvals ────┐
│ [Reserve a drawing →]   │ │ (Admin/Approver only)  │
│ [Search drawings →]     │ │ N pending reservations │
│ [My Items →]            │ │ M pending check-ins    │
│                         │ │ [Open Approvals →]     │
└─────────────────────────┘ └────────────────────────┘

┌─ My Recent Activity ────┐ ┌─ Open Check-Outs ──────┐
│ Last 5:                 │ │ (User's own)           │
│ • RES-00042 Pending     │ │ • GG-CG-00-...-0042   │
│ • RES-00041 Approved    │ │   3 days out           │
│ • GG-CG-00-...-0001    │ │ • GG-CG-00-...-0040   │
│   Checked Out 2h ago    │ │   12 days out          │
│ ...                     │ │ [My Items →]           │
└─────────────────────────┘ └────────────────────────┘
```

**Pinned broadcasts card:**
- Query: Active broadcasts where Pinned=true AND user is in audience AND user hasn't dismissed (unless RequiresAck=true and not acknowledged)
- Renders full markdown body (not truncated like bell feed)
- Severity-coloured left border (Info=blue, Warning=amber, Critical=red)
- Dismiss / Acknowledge action

**Quick Actions card:** static link buttons to most-used destinations.

**Pending Approvals card:** Admin/Approver only; counts from `enmax_autocadreservations` (Status=Pending) and `enmax_autocadcheckouts` (Status=AwaitingValidation).

**My Recent Activity card:** union of user's most recent 5 across Reservations + Checkouts + ChecksubmitRevisions, sorted by createdon/modifiedon desc.

**Open Check-Outs card:** user's own Checkouts (Status=Open or AwaitingValidation), sorted by CheckedOutOn desc.

## Step 6 — Number Sequence Critical Threshold Broadcast (deferred from plan #03)

Per PRD section 9.4 ("System raises a Critical broadcast at the 9900 threshold to give admins time to react").

**Flow:** `Number Sequence Status Watcher` (scheduled hourly, separate from broadcast fan-out).

**Steps:**

1. **Query** Number Sequence rows where `Status in (Critical, Exhausted)`
2. **For each:**
   - **Check existing broadcast** for this Sequence Key within last 7 days (`Title contains '{SequenceKey}' AND Status=Active`)
   - If exists → skip (avoid daily spam for same sequence)
   - If not → **create Broadcast row**:
     - Title = `Sequence {SequenceKey} approaching exhaustion`
     - Body = "Sequence {SequenceKey} has issued {LastIssued} of 9999 numbers ({RemainingCapacity} remaining). Critical action required: rotate to a new (Business, Asset, Unit, Domain, System, Kind) combination per PRD section 9.5 ceiling rule."
     - Severity = Critical (if 9999 Exhausted) or Critical (if 9900+ Critical)
     - Audience = Admins
     - StartsAt = now
     - ExpiresAt = now + 7 days
     - RequiresAcknowledgement = true
     - Pinned = true
     - Author = service account
   - Status compute flow (Step 4) immediately transitions to Active; fan-out (Step 2) materialises to admin In-App Notifications
3. **Audit Event:** `Event=Created`, Source=Flow, Reason="SequenceCriticalBroadcast: {SequenceKey}"

**Idempotency:** 7-day skip window prevents duplicate broadcasts; admin must acknowledge to dismiss + start a 7-day cooldown.

## Step 7 — Notification Preferences Integration (deferred from plan #07)

Per plan #07 Step 7.2 TODO: plans #05/#06/#08 currently always send email + Teams; the user preference table (`enmax_autocaduserpreference`) added in plan #07 controls per-channel opt-out.

**Update existing flows** in plans #05, #06, #08 to consult preferences before sending:

**Pattern** (added at top of each notify-recipient loop iteration):

```
1. List rows: enmax_autocaduserpreferences where User = currentRecipient
2. If result empty: use defaults (Email=true, Teams=true)
3. If EmailEnabled=true: invoke email child flow
4. Else: skip email send
5. If TeamsEnabled=true: post adaptive card
6. Else: skip Teams card
7. ALWAYS create In-App Notification row (cannot be disabled per F-33)
```

**Audit Event for preference-driven skips:** none. Skips are intentional user choice, not events worth auditing.

**Migration backfill:** the preference table is opt-in (no row = defaults). Users who want to opt out must visit Settings and toggle. No backfill needed.

## Step 8 — Tests

**Code App component tests:**

| # | Test | Asserts |
|---|------|---------|
| 1 | Broadcast form rejects ExpiresAt ≤ StartsAt | |
| 2 | Broadcast form rejects ExpiresAt > 1 year future | |
| 3 | Markdown preview renders allowed tags | |
| 4 | Markdown preview strips disallowed tags (script, iframe) | XSS defence |
| 5 | Broadcast grid hides Retired by default | "Show retired" toggle reveals |
| 6 | Bell feed groups items into Today/Earlier this week/Older | |
| 7 | Bell feed badge clamps at 99+ | |
| 8 | Mark all read updates UI optimistically | |
| 9 | Mark all read rolls back on API failure | |
| 10 | RequiresAck broadcast shows Acknowledge button, not × | |
| 11 | Click feed item navigates to DeepLinkPath + marks read | |
| 12 | Home dashboard renders 4 cards (User role) | Pending Approvals hidden |
| 13 | Home dashboard renders 5 cards (Admin role) | Pending Approvals visible |
| 14 | Pinned broadcasts render at top of Home | |
| 15 | Pinned dismiss writes Broadcast Dismissal row | |

**Integration tests (real Dataverse):**

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

## Verification — End-to-End Checklist

```powershell
Set-Location apps/code-app
npm test -- src/features/broadcasts src/app/NotificationFeedPanel src/pages/Home
npx playwright test src/features/broadcasts

# Build + push
npm run build
npx power-apps push --environmentId $env:DEV_POWER_APPS_ENV_ID

# Solution import (broadcast fan-out flow, status compute flow, sequence critical watcher flow)
Set-Location ../..
python solution/scripts/pack.py
python solution/scripts/import.py

# Manual smoke
# 1. Admin creates Broadcast: Title="Test maintenance", Severity=Warning, Audience=Everyone,
#    StartsAt=now, ExpiresAt=now+1h, Pinned=true → expect immediate fan-out
# 2. User account: refresh → bell badge shows 1; open panel → Today group has broadcast;
#    Home dashboard shows pinned card; click Acknowledge → card disappears
# 3. Admin: Edit broadcast → StartsAt=now-1h, ExpiresAt=now-1m → expect transition to Expired
#    on next status-compute flow run (or trigger manually)
# 4. Admin: in Settings, set notification prefs EmailEnabled=false → create new reservation
#    as User → admin should receive Teams card + in-app notification but NO email
# 5. Manual seed: update Number Sequence ZZ-ZZ-ZZ-ZZZ-ZZZ-ZZ LastIssued=9905 →
#    trigger sequence-watcher flow → expect Critical broadcast created + admin In-App
#    notification
```

**Acceptance:**
- All 23 tests pass
- Phase 1 Acceptance Criteria covered: A15 (in-app feed end-to-end), A16 (broadcast author/fan-out/dismiss/acknowledge end-to-end), A12 (maintenance banner from plan #04 still works)
- All Phase 1 features now shipped — plan #09 is UAT promotion only
- PR reviewed by Rahul, squash-merged to `dev`

## Critical Files to Read Before Starting

| File | Why |
|------|-----|
| PRD sections 4 (F-33/F-34/F-35), 6, 7 (Broadcast schema), 10 (fan-out flow), 11.3 | Authoritative requirements + schema + UX |
| Plan #04 NotificationBell + MaintenanceBanner | Existing structure to extend |
| Plan #07 EnmaxDataGrid + notification prefs table | Components + schema to reuse |
| [react-markdown docs](https://github.com/remarkjs/react-markdown) | Safe markdown rendering |

## Downstream Plans Unblocked

| Plan | Unblocked? | Why |
|------|------------|-----|
| #09 UAT promotion | Yes | All Phase 1 features now complete; #09 is runbook execution + smoke rehearsal |

## Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| Markdown XSS via crafted body content | `react-markdown` allow-list strictly limits tags; tests #4 cover; CSP from Power Apps host blocks inline scripts anyway |
| Fan-out flow API quota spike on large audience broadcast | 670 users × 1 broadcast = 1340 calls (check + create). Daily quota 40K. Fan-out runs hourly → 24 × 1340 = 32K. Tight but within. If Phase 2 audience grows, batch fan-out via Power Automate's bulk Dataverse operation or shift to nightly cadence. |
| Broadcast immediate-fan-out on edit creates dup notifications | Idempotency check (Step 2) skips users w/ existing row; no dups |
| User w/ very long feed (e.g. 5000 unread) hits perf wall | Bell query limited to 50 most recent; "Load more" paginates. Mark-all-read is one PATCH per row (worst case 50 per click; acceptable). For >1000 unread, advise admin to bulk-mark via Administration model-driven app |
| Markdown preview renders external link `<a href="javascript:...">` | react-markdown sanitises href via default schema; tested explicitly |
| Critical-threshold broadcast spam if admin doesn't act on 9900 sequence | 7-day cooldown per sequence + RequiresAck=true keeps the broadcast pinned until admin acknowledges; only one broadcast per sequence per week |
| Notification preference table query adds latency to every notify flow | Single Dataverse `List rows` w/ filter on user GUID; <100ms; cached for flow duration |
| Bell panel poll cadence load | **Resolved 2026-05-18 (Finding 5.4):** switched from 30s interval to `refetchOnWindowFocus: true` + 5-min keepalive. ~10x reduction in idle-tab queries. Active-use freshness preserved via focus refetch. |
| Mark-all-read on session w/ thousands of unread rows takes minutes | Cap mark-all-read to 50 most-recent (matches visible feed); older unread stays unread; documented in tooltip |
| Pinned broadcast clutters Home for users in multiple audiences | Per-user dismissal + acknowledgement clears pinning for that user; "Pinned for everyone" is admin discretion + sparingly used by convention |

## TODOs Left in This Plan

- **`react-markdown` rehype-sanitize plugin pin:** verify default sanitisation schema strips `javascript:` href + `data:` URIs at implementation. If gaps, add `rehype-sanitize` explicitly.
- **Number Sequence Status Watcher cadence:** hourly is chosen; verify against PRD if a different cadence is required. Document in implementation if tuned.
- **Critical broadcast template vs admin-authored:** Step 6 auto-generates the broadcast; admins can edit body via Broadcast author UI before acknowledging. Decision: auto-create stays read-only by author=service-account marker; admin edits create a new admin-authored superseder broadcast. Document UX at implementation.
- **End-of-Phase-1 verification:** after plan #08 merges, run full acceptance-criteria pass A1–A19 from cut-line spec against dev tenant. Document gaps as bugs for plan #09 (UAT promotion blocker).
