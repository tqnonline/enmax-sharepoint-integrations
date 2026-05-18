# Plan #07 — Search + My Items + Reference Data + Audit + Settings

**Date:** 2026-05-17
**Owner:** Engineering (Claude Code agent + one human reviewer: Rahul Akmol)
**Spec:** `2026-05-17-phase-1-cut-line-spec.md`
**PRD refs:** sections 4 (F-17 through F-38), 5.4 (search journey), 6 (info arch), 7 (schema), 12 (security), 17 (two-app split)
**Decisions:** `2026-05-17-open-questions-decision-memo.md`
**Estimated effort:** 26–30 hours (was 20–24h; +6h added 2026-05-18 for `AuditEmitter` C# plug-in scope per architecture review decisions)
**Branch:** `feat/007-search-and-admin-surfaces` → PR to `dev`
**Blocked by:**
- Plans #01–#06 merged
- Drawing, Reservation, Checkout, Audit Event, all reference tables populated in dev tenant (per plan #02 seed)
- DrawingActionsPanel reusable component from plan #06

## Context

This plan replaces five placeholder pages from plan #04 with the real Search, My Items, Reference Data, Audit, and Settings surfaces. Together they're the day-to-day working environment for ~70 active users and 600 read-only consumers. They share a single virtualised DataGrid pattern (with quick-search, sort, column filters, paging, column visibility, admin-only CSV export) that plan #08 will reuse for Broadcasts.

After this plan merges, an end user can search the full drawing catalogue, open a drawing's side panel to see metadata + state + checkout history, click Check Out (component from plan #06) directly from the side panel, and view their personal queue in My Items. Admins can manage every reference table, browse the audit log, seed Number Sequences via bulk CSV, and toggle Single Admin Mode from Settings.

This plan does **not** ship: Broadcasts (plan #08), the in-app bell-panel feed UX beyond plan #04's structure (plan #08), UAT promotion (plan #09).

## Prerequisites

- All prior plans merged to `dev`
- IssueNumbers + check-out / revision flows operational in dev tenant
- ~50+ Drawings exist in dev tenant from prior smoke tests (Search needs realistic data volume)
- App Configuration has all 21 keys per plan #02 Step 9
- Audit Event rows exist from prior plan smoke runs

## Out of Scope for This Plan

- Broadcast author UI, broadcast banner, bell-panel feed grouping (plan #08)
- UAT promotion (plan #09)
- Power BI dashboards (cut-line spec — out of Phase 1 permanently)
- Per-Business Generation segmentation beyond owner-based row scope (PRD section 12.5 defers to Phase 2)
- Bulk reference-data CSV import for tables other than Number Sequence (admin can edit row-by-row; bulk import is single-purpose for legacy migration of Number Sequence per F-38)

## Step 1 — Shared DataGrid Component

Build once, used 6+ times across this plan and reused in plan #08 Broadcasts.

**File:** `src/components/DataGrid/EnmaxDataGrid.tsx`

**API:**

```typescript
interface EnmaxDataGridProps<T> {
  queryKey: QueryKey;                        // React Query identifier
  fetcher: (params: GridFetchParams) => Promise<{ rows: T[]; totalCount: number }>;
  columns: ColumnDef<T>[];
  rowActions?: RowAction<T>[];               // Buttons in trailing action column
  bulkActions?: BulkAction<T>[];             // Enabled when rows selected
  enableExport?: boolean;                    // CSV; gated to Admin via internal check
  enableColumnVisibility?: boolean;
  defaultSort?: { column: string; direction: "asc" | "desc" };
  initialPageSize?: number;                  // Default 50
  quickSearchPlaceholder?: string;
  emptyMessage?: string;
  errorMessage?: string;
}

interface GridFetchParams {
  search: string;                            // Quick-search input value
  filters: Record<string, FilterValue>;      // Column-level filter chips
  sort: { column: string; direction: "asc" | "desc" } | null;
  page: number;                              // 0-indexed
  pageSize: number;
}

interface ColumnDef<T> {
  id: string;
  header: string;
  accessor: (row: T) => unknown;
  cell?: (row: T) => ReactNode;              // Custom renderer
  sortable?: boolean;
  filterable?: boolean;
  filterType?: "text" | "select" | "date";
  filterOptions?: { value: string; label: string }[];  // For select
  exportFormatter?: (value: unknown) => string;        // CSV cell
  visibleByDefault?: boolean;
  width?: number | "auto";
}
```

**Built on:** Fluent UI v9 `DataGrid` + `@tanstack/react-virtual` for row virtualisation (>1000 rows). React Query for fetch + cache. Server-side paging via Dataverse Web API `$top` + `$skip` + `$count=true`.

**CSV export** (admin-only): client-side; queries ALL pages (up to `MaxExportRows=10000` config-pinned) sequentially, builds CSV string, triggers browser download via `Blob` + `URL.createObjectURL`. Header row uses `column.header`; cells use `column.exportFormatter` if provided else `String(accessor(row))`. Audit Event written for every export per F-19 admin-gated rule.

**Quick-search behaviour:** 200ms debounce; sends to fetcher as `params.search`; consumers translate to FetchXML/`$filter` per their schema (e.g. Search consumer maps to `contains(enmax_acdntitle, '{search}') or contains(enmax_acdnnumber, '{search}')`).

**Column filter chips:** per-column; renders inline below header; filter state persists in URL query string so users can share filtered views.

**Tests:** in `src/components/DataGrid/__tests__/`:
- Pagination: 100 rows in 4 pages, navigates correctly
- Virtualisation: 10,000-row dataset, only ~30 DOM rows present at any moment
- CSV export hidden for non-Admin role
- CSV export download triggers Audit Event
- URL query string updates on filter change

## Step 2 — Search (`/search`)

Per PRD F-17, F-18, F-19, section 5.4.

**File:** `src/features/search/SearchPage.tsx`

**Fetcher:** queries `enmax_autocaddrawings` with composed FetchXML:
- Quick-search: `contains(enmax_acdnnumber, '{search}') or contains(enmax_acdntitle, '{search}') or contains(_enmax_acdnvendor_value@OData.Community.Display.V1.FormattedValue, '{search}')`
- Filters: per-column maps to lookup filters (Business, Asset, Unit, Domain, System, Kind, Record Type, Record Phase, Vendor); multi-select within a segment becomes `or` clauses
- Sort: `$orderby={column} {direction}`
- Default sort: ENMAX Number ascending
- **Latest version only** per F-18: every Drawing row IS the latest version (revision is a column rollup, not separate rows); no de-dup needed

**Columns:**

| Column | Source | Sortable | Filterable | Notes |
|--------|--------|----------|------------|-------|
| ENMAX Number | `enmax_acdnnumber` | Yes | Text | Bold; copy-to-clipboard button on hover |
| Title | `enmax_acdntitle` | Yes | Text | Hyperlink → opens SharePoint document in new tab via `enmax_acdnsplibraryurl` + filename composition |
| Business | Lookup display | Yes | Select | Multi-select from 6-segment dropdowns mirroring Reserve wizard |
| Asset | Lookup display | Yes | Select | |
| Unit | Lookup display | Yes | Select | |
| Domain | Lookup display | Yes | Select | |
| System | Lookup display | Yes | Select | |
| Kind | Lookup display | Yes | Select | |
| Record Type | Lookup display | Yes | Select | |
| Record Phase | Lookup display | Yes | Select | |
| Vendor | Lookup display | Yes | Select | |
| Current Revision | `enmax_acdncurrentrevision` | Yes | Text | |
| Revision Date | `enmax_acdnrevisiondate` | Yes | Date | |
| State | `enmax_acdnstate` (option set) | Yes | Select | Icon + label per state per PRD section 27 |
| Requester | `_createdby_value` | Yes | Text | |
| Checked Out By | Computed (joined Checkout) | No | Text | Empty unless State=CheckedOut |
| Days Out | Computed | No | — | `dateDiff(utcNow(), Checkout.CheckedOutOn)` if CheckedOut |
| Sheets | `enmax_acdnsheetcount` | Yes | Text | |

**Visible-by-default columns:** ENMAX Number, Title, Business, Asset, Unit, Domain, System, Kind, Current Revision, Revision Date, State, Requester, Days Out (when applicable). Others toggleable.

**Row click → side panel:** opens `DrawingDetailPanel` (new component in `src/features/search/DrawingDetailPanel.tsx`):
- Full metadata (every column)
- SharePoint library link
- Sheet list with per-sheet URLs (if uploaded) + state
- DrawingActionsPanel from plan #06 (Check Out / Submit Revision / Validation / Force Checkin per state + role)
- Audit trail for this Drawing (last 20 events, expand for full)

**Inline number-suggestion** per PRD section 5.4: typing in quick-search with regex matching `\d{4}` (looks like a sequence number) → suggestions panel shows top 5 matching ENMAX Numbers below input. 200ms debounce. Implemented via `Combobox` from Fluent UI v9 with custom popup.

**CSV export:** admin-only; respects current filters; exports up to `MaxExportRows=10000` rows.

## Step 3 — My Items (`/my-items`)

Per F-20. Personal view: 2 grids in a tabbed layout.

**Tabs:**

| Tab | Source | Filter |
|-----|--------|--------|
| My Reservations | `enmax_autocadreservations` | `_ownerid_value = currentUserId` AND `Status in (Pending, Approved)` (Declined/Cancelled auto-hide per F-20 "disappear from view once finalised"; configurable to include in "show finalised" toggle) |
| My Checked-Out Drawings | join `enmax_autocadcheckouts` (Status=Open or AwaitingValidation, owner=currentUserId) → `enmax_autocaddrawings` | |

**Grid columns (My Reservations):**

| Column | Source |
|--------|--------|
| Reservation ID | `enmax_acdnreservationid` |
| Status | `enmax_acdnstatus` w/ icon |
| Composition | Live-computed `BB-AA-UU-DDD-SSS-KK-????` (Pending) or `BB-AA-UU-DDD-SSS-KK-nnnn..nnnn` (Approved) |
| Count | `enmax_acdndrawingcount` |
| Submitted | `createdon` |
| Approved/Declined On | `enmax_acdnapprovedon` |
| Approver | `_enmax_acdnapprover_value` |
| Reason | `enmax_acdnreason` (truncated) |

**Row actions:** Open detail panel; Cancel (if status=Pending — user can withdraw own pending reservation per PRD section 12.4 "Cancel own pending Reservation: Yes").

**Grid columns (My Checked-Out Drawings):**

| Column | Source |
|--------|--------|
| ENMAX Number | Drawing.ENMAX Number |
| Title | Drawing.Title |
| Checked Out On | Checkout.CheckedOutOn |
| Days Out | Computed |
| Reminder Stage | Checkout.ReminderStage (None / ThreeMonth / SixMonth / TwelveMonth) |
| Status | Checkout.Status (Open / AwaitingValidation) |
| Library URL | Drawing.SharePointLibraryUrl (link) |

**Row actions:** Open Drawing side panel (with DrawingActionsPanel — Submit Revision if Open, else read-only state label).

**"Show finalised" toggle:** unchecked by default per F-20; checked shows Declined/Cancelled Reservations and ClosedApproved/ClosedDeclined/ClosedForced Checkouts (for audit / personal history).

## Step 4 — Reference Data (`/reference-data`)

Per F-21, F-32. Admin-only (RequireRole={Admin}).

**Layout:** left rail lists every reference table; selecting one shows the EnmaxDataGrid scoped to that table. One unified pattern, no per-table custom UI (per PRD section 17.1: "polished, opinionated view ... not raw form editing").

**Tables listed:**

| Display | Schema |
|---------|--------|
| Business | `enmax_autocadbusiness` |
| Asset | `enmax_autocadasset` |
| Unit | `enmax_autocadunit` |
| Domain | `enmax_autocaddomain` |
| System | `enmax_autocadsystem` |
| Kind | `enmax_autocadkind` |
| Record Type | `enmax_autocadrecordtype` |
| Record Phase | `enmax_autocadrecordphase` |
| Vendor | `enmax_autocadvendor` |
| Approved BB–AA Combinations | `enmax_autocadbusinessasset` |
| Asset–Unit | `enmax_autocadassetunit` |
| System Scoping Rule | `enmax_autocadsystemscope` |
| **Number Sequences** | `enmax_autocadnumbersequence` (special — see Step 5) |

**Standard columns per reference table:** Code, Display Name, Description, Status (Active/Inactive toggle), Sort Order.

**Row actions:**
- Edit (opens side-panel form; Zod-validated; PATCH on row)
- Deactivate / Reactivate (toggles Status; audit event written)
- Delete (hidden — soft-delete only via Status flip per F-32; hard-delete reserved for Administration model-driven app for emergency cases)

**Add Row button** in command bar:
- Opens same side-panel form in create mode
- Required fields: Code, Display Name
- Code uniqueness validated client-side + server-side
- On submit: POST + audit event

**Junction-table editors** (Approved BB-AA, Asset-Unit, System Scope) require special form fields:
- Approved BB-AA: two Lookup pickers (Business, Asset) + nothing else
- Asset-Unit: two Lookup pickers + optional SharePoint Library URL (read-only — populated by plan #06 provisioning flow)
- System Scope: System picker + ScopeType select + ScopeValue text (with hint per ScopeType) + Active toggle

**Every reference data change writes an Audit Event** per F-32; written automatically by the new `AuditEmitter` C# plug-in (Step 4b) — replaces the original 12-child-flows approach per architecture review decision 2026-05-18 (Anti-Pattern #1 + #5).

**Step 4b: `AuditEmitter` Dataverse plug-in (single C# class)** *(replaces the deferred-from-plan-#05 flow approach per architecture review 2026-05-18)*.

Single C# plug-in (`solution/plugins/AuditEmitter/`) registered on Create/Update/Delete of every reference table AND on Update of Checkout (covers the Submit Revision Open→AwaitingValidation transition per architecture review Anti-Pattern #5). Reuses csproj + test infra patterns from plan #03 IssueNumbers.

**Registered steps:**

| Message | Entity | Stage | Mode |
|---------|--------|-------|------|
| Create | each of 12 reference tables | PostOperation | Synchronous |
| Update | each of 12 reference tables | PostOperation | Synchronous |
| Delete | each of 12 reference tables | PostOperation | Synchronous |
| Update | `enmax_autocadcheckout` | PostOperation | Synchronous (filtered to status change only via filtering attributes) |

**Plug-in behaviour:**

```csharp
public class AuditEmitter : PluginBase
{
  protected override void ExecuteDataversePlugin(ILocalPluginContext ctx)
  {
    var pluginCtx = ctx.PluginExecutionContext;
    var orgSvc = ctx.OrgSvcFactory.CreateOrganizationService(pluginCtx.UserId);

    var subjectTable = pluginCtx.PrimaryEntityName;
    var subjectId = pluginCtx.PrimaryEntityId;
    var (eventType, reason) = ClassifyEvent(pluginCtx, subjectTable);

    var auditRow = new Entity("enmax_autocadauditevent")
    {
      ["enmax_acdnsubjecttable"] = subjectTable,
      ["enmax_acdnsubjectid"] = subjectId.ToString(),
      ["enmax_acdnevent"] = new OptionSetValue((int)eventType),
      ["enmax_acdnreason"] = reason,
      ["enmax_acdnsource"] = new OptionSetValue(4),  // Action / synchronous platform
      ["enmax_acdnactedby"] = new EntityReference("systemuser", pluginCtx.UserId),
    };
    orgSvc.Create(auditRow);
  }

  // ClassifyEvent inspects message + table to return (eventType, reason)
  // - Reference-table Create/Update/Delete → ReferenceDataChanged
  // - Checkout Update with status change → StateChanged w/ from/to
}
```

**Effort:** ~6h (csproj setup reuses plan #01 scaffolding; class is straightforward; unit tests via FakeXrmEasy similar to plan #03 pattern but simpler — no concurrency, no retry logic).

**Why plug-in not 12 child flows:** maintenance (1 class vs 12 flow definitions), better performance (in-process write vs Power Automate run overhead), consistent w/ plan #03 plug-in infrastructure. Architecture review Anti-Pattern #1.

**Tests:** ~10 unit tests via xUnit + FakeXrmEasy (one per reference table type + one per Checkout status transition). Single CODEOWNERS entry covers `solution/plugins/AuditEmitter/`; single-reviewer model per project decision.

## Step 5 — Number Sequences sub-destination

Per F-38, PRD section 9.4. Within Reference Data, the Number Sequences table gets specialised UI because it carries operational semantics (seed values, capacity, status) beyond simple reference data.

**Grid columns:**

| Column | Source |
|--------|--------|
| Sequence Key | `enmax_acdnsequencekey` |
| Business / Asset / Unit / Domain / System / Kind | Denormalised columns |
| Seed Value | `enmax_acdnseedvalue` (editable inline w/ guards) |
| Last Issued | `enmax_acdnlastissued` (read-only) |
| Remaining Capacity | Computed `9999 - LastIssued` (read-only) |
| Status | `enmax_acdnstatus` (Healthy/Warning/Critical/Exhausted) w/ severity icon |
| Last Issued At | `enmax_acdnlastissuedat` (read-only) |
| Seeded By | `_enmax_acdnseededby_value` |
| Seeded On | `enmax_acdnseededon` |
| Seed Reason | `enmax_acdnseedreason` (truncated; full in detail) |

**Default sort:** Status desc (Critical first), then Last Issued desc.

**Status colouring:** Critical = red, Warning = amber, Healthy = green, Exhausted = grey w/ red border.

**Row actions:**
- Edit Seed Value (opens dialog)
  - If `LastIssued > 0`, requires typed reason min 10 chars per PRD section 9.4
  - Validation: `newSeedValue > currentLastIssued` (enforced both client + plug-in)
  - Writes audit event w/ reason
- View Audit Trail (filters Audit page to this sequence's events)

**Command bar:**
- "Bulk Import (CSV)" button (Step 5b)
- "Export current sequences (CSV)" — admin-only, all sequences w/ current state

### Step 5b: Bulk CSV Import

Per PRD section 9.4 path 2 ("CSV bulk import. The admin uploads a CSV with columns `SequenceKey, SeedValue, Reason` and the import action upserts every row. Validation rejects any row whose `SeedValue` is less than the existing `LastIssued` on that sequence; the entire batch fails atomically if any row is invalid.").

**CSV format:**

```csv
SequenceKey,SeedValue,Reason
GG-CG-00-ECS-AST-DD,500,Legacy migration cutover - last issued in legacy SQL was 0500
GG-GN-A1-MEC-PMP-DR,1200,Legacy cutover
...
```

**Dialog flow:**

1. **Upload** — file picker; client parses CSV via `papaparse`
2. **Preview** — table of parsed rows w/ validation status:
   - Valid (green)
   - Invalid: SequenceKey not found (orange)
   - Invalid: SeedValue ≤ existing LastIssued (red)
   - Invalid: missing Reason when sequence has issued rows (red)
   - Invalid: malformed CSV row (red)
3. **Atomic batch validation** — if ANY row invalid, "Import" button disabled. Admin fixes CSV externally and re-uploads.
4. **Import** — for each valid row, calls a new bound custom action `enmax_acdnSeedNumberSequence`:
   - Inputs: SequenceKey, SeedValue, Reason
   - Implementation: flow validates again (guard against race between upload-preview and import), updates Number Sequence row, writes Audit Event
5. **Result table** — per-row success/failure (partial failures possible if Dataverse rejects a row that passed client validation; rare but surfaced)

**`enmax_acdnSeedNumberSequence` custom action** authored per plan #02 maker discipline. Bound to Number Sequence entity.

## Step 6 — Audit (`/audit`)

Per F-24, F-29. Admin-only.

**EnmaxDataGrid columns:**

| Column | Source |
|--------|--------|
| Acted On | `createdon` (event timestamp) — default sort desc |
| Event | `enmax_acdnevent` (option set; icon per type) |
| Subject Table | `enmax_acdnsubjecttable` |
| Subject ID | `enmax_acdnsubjectid` (deep-link if recognisable table) |
| From → To | `enmax_acdnfromstate` + `enmax_acdntostate` (only for StateChanged) |
| Reason | `enmax_acdnreason` (truncated) |
| Source | `enmax_acdnsource` (CodeApp/AdminApp/Flow/Action) |
| Acted By | `_enmax_acdnactedby_value` |
| Acted On Behalf Of | `_enmax_acdnactedonbehalfof_value` (filled when service account acts on user's behalf via flow) |

**Filters:**

- Date range (default: last 30 days; max range: all-time)
- Event (multi-select)
- Subject Table (multi-select)
- Subject ID (text)
- Acted By (people picker)
- Source (multi-select)

**CSV export:** admin-only; respects filters; capped at `MaxExportRows=10000`.

**No row actions:** audit is read-only by design (per PRD section 17.2 — model-driven Administration app is the escape hatch for emergency edits, never the Code App).

## Step 7 — Settings (`/settings`)

Per F-27, F-33. All roles.

**Sections:**

### 7.1 Theme

- Theme dropdown: Light / Dark / System (from plan #04 `uiStore.themeOverride`)
- Applied immediately

### 7.2 Notification preferences

- Per-channel toggles (default all ON):
  - Email notifications
  - Teams adaptive cards
  - In-app notifications (cannot disable — bell is always present per PRD section 6)
- Stored per-user via new Dataverse `enmax_autocaduserpreference` table (single row per user, owner-scoped)
- TODO: add table to plan #02 schema (single-line addition); columns: User (lookup), EmailEnabled (bool, default true), TeamsEnabled (bool, default true)
- Notification flows in plans #05/#06/#08 read this row before sending email/Teams; in-app always writes

### 7.3 Administrator section (Admin role only)

- **Single Admin Mode** toggle (drives `AppConfig.SingleAdminMode` write)
  - On enable: confirm dialog "All end users will be locked out of state-changing actions. Proceed?"
  - Updates App Configuration row (only Admin role can write per plan #02 security)
  - Audit Event written (`Event=ConfigChanged`)
- **View as end user** toggle (visible only when SingleAdminMode=true per PRD F-27)
  - Stored in `uiStore.viewAsEndUser` (session only, not persisted to user prefs)
  - When ON: components consult `useEffectiveRole()` which returns "User" instead of "Admin" → role-gated UI hides admin destinations + actions
  - Sticky banner at top: "Viewing as end user. [Disable]"
  - Useful for admins to verify the end-user experience without logging out

### 7.4 About

- App version (semver from build) per F-36
- Release date per F-36
- Disclaimer per F-36 (from AppConfig.FooterDisclaimer)
- Copyright per F-36 (from AppConfig.FooterCopyright)
- Link to "Open in browser" play URL (for shareable links)

## Step 8 — ~~Audit Reference Data Changes Flow~~ → Superseded by Step 4b `AuditEmitter` Plug-in

*Original Step 8 (12-flow / single-flow Power Automate approach) was superseded by the C# `AuditEmitter` plug-in in Step 4b per architecture review decision 2026-05-18. See Step 4b for the full implementation. This Step retained as a stub to preserve step numbering.*

## Step 9 — Tests

**EnmaxDataGrid component tests:**

| # | Test | Asserts |
|---|------|---------|
| 1 | Renders rows from fetcher | |
| 2 | Pagination navigates correctly | |
| 3 | Virtualisation: 10K rows → ≤30 DOM rows | |
| 4 | CSV export hidden for non-Admin | |
| 5 | CSV export downloads + writes Audit Event | |
| 6 | Quick-search debounces 200ms | |
| 7 | Column filter chip persists to URL query string | |
| 8 | Column visibility menu toggles columns | |
| 9 | Sort change triggers refetch w/ updated `$orderby` | |
| 10 | Empty state renders custom message | |

**Search-specific tests:**

| # | Test | Asserts |
|---|------|---------|
| 11 | Quick-search "0042" surfaces inline number suggestions | |
| 12 | Multi-select Business filter sends `or` clause | |
| 13 | Row click opens DrawingDetailPanel | |
| 14 | DrawingDetailPanel renders DrawingActionsPanel from plan #06 | |
| 15 | SharePoint link opens in new tab | `target="_blank"` |

**My Items tests:**

| # | Test | Asserts |
|---|------|---------|
| 16 | My Reservations scoped to current user | Mock fetcher receives `_ownerid_value` filter |
| 17 | My Reservations hides Declined by default | Show-finalised toggle off |
| 18 | Cancel own pending reservation calls action | |
| 19 | My Checked-Out joins Checkout + Drawing | |

**Reference Data tests:**

| # | Test | Asserts |
|---|------|---------|
| 20 | Left rail shows 13 reference tables (12 + Number Sequences) | |
| 21 | Add Row form validates Code uniqueness | Server-side rejection surfaced |
| 22 | Deactivate writes Audit Event | |
| 23 | Junction table editor (BB-AA) requires both lookups | |

**Number Sequences tests:**

| # | Test | Asserts |
|---|------|---------|
| 24 | CSV import validation rejects SeedValue ≤ LastIssued | Red row in preview |
| 25 | CSV import disabled when any row invalid | Atomicity per F-38 |
| 26 | Valid CSV import calls SeedNumberSequence action per row | |
| 27 | Edit Seed Value requires reason when LastIssued > 0 | |

**Audit tests:**

| # | Test | Asserts |
|---|------|---------|
| 28 | Default date range = last 30 days | |
| 29 | All filters compose correctly into FetchXML | |
| 30 | No row actions present | Read-only enforcement |

**Settings tests:**

| # | Test | Asserts |
|---|------|---------|
| 31 | Theme dropdown writes to uiStore | |
| 32 | Notification preferences persist to Dataverse | |
| 33 | Single Admin Mode toggle visible only to Admin | |
| 34 | View as end user toggle only visible when SingleAdminMode=true | |
| 35 | View as end user hides admin destinations from sidebar | useEffectiveRole returns "User" |

**Playwright a11y:** every route + every modal/dialog/panel passes axe-core w/ zero violations.

## Verification — End-to-End Checklist

```powershell
Set-Location apps/code-app
npm test -- src/components/DataGrid src/features/search src/features/myitems src/features/referencedata src/features/audit src/features/settings
npx playwright test src/features/

# Build + push
npm run build
npx power-apps push --environmentId $env:DEV_POWER_APPS_ENV_ID

# Solution: pack + import (new SeedNumberSequence action + Audit RefData Changed flow)
Set-Location ../..
python solution/scripts/pack.py
python solution/scripts/import.py

# Manual smoke
# 1. Search: 50+ Drawings render; filter by Business + Asset; sort by Revision Date; export CSV (admin); confirm Audit Event row appears
# 2. My Items: User account sees own Reservations + Checkouts; "Show finalised" toggle reveals Declined
# 3. Reference Data: Admin adds a new Vendor; edit + deactivate; confirm Audit Event
# 4. Number Sequences: Upload sample CSV with 3 valid + 1 invalid row; expect import disabled; fix CSV; re-upload; confirm 3 sequences updated + 3 audit events
# 5. Audit: Filter by Event=ReferenceDataChanged + date range last 24h; CSV export
# 6. Settings: Toggle theme; Admin toggles Single Admin Mode; confirms maintenance banner appears (from plan #04); enables "View as end user"; sidebar collapses to user-only destinations
```

**Acceptance:**
- All 35 component tests + a11y suite pass
- End-to-end smoke succeeds across 3 test roles
- Plug-in concurrency test still passes (regression)
- Phase 1 Acceptance Criteria from cut-line spec covered by this plan: A6 (Search sub-second on 10K rows), A17 (every grid has search/sort/filter/paging/visibility/CSV), A18 (Admin seeds sequences single + bulk CSV w/ atomic validation)
- PR reviewed by Rahul, squash-merged to `dev`

## Critical Files to Read Before Starting

| File | Why |
|------|-----|
| PRD section 4 F-17 to F-38 | Authoritative acceptance criteria |
| PRD section 5.4 + section 6 | Search journey + screen inventory |
| PRD section 9.4 + F-38 | Seed value math + CSV import semantics |
| Plan #04 routes.tsx + RequireRole | Route-gating pattern |
| Plan #06 DrawingActionsPanel | Reusable component to host in Search side panel |
| [Fluent UI v9 DataGrid](https://react.fluentui.dev/?path=/docs/components-datagrid--default) | Component API for shared grid |
| [@tanstack/react-virtual](https://tanstack.com/virtual/latest) | Row virtualisation for 10K+ datasets |

## Downstream Plans Unblocked

| Plan | Unblocked? | Why |
|------|------------|-----|
| #08 Broadcast + notifications | Yes | EnmaxDataGrid pattern available for Broadcasts grid; Audit log queryable for broadcast events |
| #09 UAT promotion | Yes | All Phase 1 features now feature-complete after #07; #09 is purely promotion + runbook execution |

## Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| Virtualisation library + Fluent DataGrid v9 integration is finicky | Build EnmaxDataGrid first w/ comprehensive tests (Step 1); other features depend on it being solid. Reference Fluent + tanstack virtual examples; expect 1–2 days of integration work |
| CSV export on 10K rows hangs the UI | Web Worker for CSV string assembly; show progress dialog; cap at MaxExportRows config-pinned |
| Number Sequence CSV import partial-failure leaves system inconsistent | Atomic validation rejects entire batch if any row invalid (F-38 requirement enforced client-side AND in plug-in for race); on per-row Dataverse failure during import (post-validation), surface failed rows + their errors; admin re-uploads only failed subset. Deterministic GUIDs make re-attempts safe. |
| Audit log grows unbounded (no Phase 1 retention policy) | Document as Phase 2 watch-item; current Dataverse storage capacity (per runbook #003) supports ~5 years at expected event rate (~100 events/day × 5y × 1KB = ~180 MB). Add a runbook #009 addendum to monitor row count quarterly. |
| Search FetchXML query complexity exceeds Dataverse limits at 6+ filters | Test w/ all filters applied at once during smoke; Dataverse limit is 500 conditions per query — far above realistic UI |
| Reference data editor lets admin deactivate a value still referenced by Drawings | Deactivate sets Status=Inactive; hides from new reservations but does NOT break existing rows referencing it (no FK cascade). Document semantics: "Inactive = hidden from new selections; existing data unaffected." |
| Junction table editor (BB-AA) lets admin remove an approved combo while Reservations are pending | Deactivate not Delete; reservation already has the combo recorded; only future selections hidden. |
| "View as end user" mode admin confused about why their action failed | Sticky banner always visible w/ "Disable" link; tooltips on hidden destinations explain "Hidden in View-as-end-user mode" |
| Notification prefs added to user pref table → migration needed | Schema addition is non-breaking; existing users default to ON for all channels (matches current behaviour). |

## TODOs Left in This Plan

- **Add `enmax_autocaduserpreference` table to plan #02 schema** — one-time addition; columns User (lookup), EmailEnabled (bool default true), TeamsEnabled (bool default true), CreatedOn. Single row per user.
- **`enmax_acdnSeedNumberSequence` custom action** — author in maker per Step 5b; bound to Number Sequence.
- ~~Audit Reference Data Changed flow — Step 8 single flow vs 12 child flows decision~~ **Resolved 2026-05-18: superseded by `AuditEmitter` C# plug-in (Step 4b).**
- **CSV export Audit Event source type** — currently writes `Source=CodeApp` w/ Event=Created? Or new option `Source=Export`? Decide at implementation; consistent w/ existing audit taxonomy.
- **Audit log retention monitoring** — runbook #009 addendum (deferred).
- **Notification preferences integration with flows** — plans #05/#06 currently always send email + Teams; this plan adds preference table but flow updates happen in this plan or as small post-plan-07 fix. Decision: implement as Step 10 here (small flow update across the 6+ notification fan-outs). Document in implementation.
