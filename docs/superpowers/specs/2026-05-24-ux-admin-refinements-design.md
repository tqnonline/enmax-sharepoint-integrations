# UX & Admin Refinements — Design Spec

**Date:** 2026-05-24
**Status:** Approved
**Scope:** Code App (React + Fluent UI v9 + TanStack Query) — UI/UX fixes, two small new admin surfaces, audit server-side paging. Builds on the integrated `feat/008` + plan-07 branch (PR #7).

---

## 1. Overview

Eleven issues found during dev review of the Code App, grouped into three layers: **shared infrastructure** (fix once, reuse everywhere), **per-screen fixes**, and **new pages/behavior**. Building the shared primitives first eliminates the recurring themes (inconsistent pagination, empty-treated-as-error, duplicate filter boxes) at the source rather than per screen.

All work targets `apps/code-app`. No Dataverse schema changes. One new generated-service consumer (App Config editor). Audit gains server-side paging.

---

## 2. Shared Infrastructure (build first)

### 2.1 Pagination (#2, #6 — all grids)
Every grid reads the shared `usePageSize()` hook (`apps/code-app/src/config/usePageSize.ts`), which returns `GridPageSize` from AppConfig (Zod default **10**).

- `EnmaxDataGrid` (`components/DataGrid/EnmaxDataGrid.tsx`): remove the hardcoded `initialPageSize: 50` default; default to `usePageSize()` unless a `pageSize` prop is explicitly passed.
- `ReservationDrawingsPanel` uses a manual Fluent `<DataGrid>` with `useState(drawingPage)` paging — switch its page size to `usePageSize()`.
- Audit page paging (see 3.1) uses `usePageSize()` for its server page size.

**Success:** no grid hardcodes a page size; changing `GridPageSize` in AppConfig changes every grid; absent config → 10.

### 2.2 Empty / Error / Loading states (#9 — app-wide)
Today a genuinely empty result surfaces as "failed to load" and can retry-loop. Fix centrally:

- In `EnmaxDataGrid`, distinguish **success-with-zero-rows** from **fetch error**. Zero rows → a friendly **empty state** ("No <items> yet" + an optional **Add** action passed via prop), NOT an error, NOT a retry.
- Real fetch failure → the existing `MessageBar` error path.
- Provide a small shared `<EmptyState>` component (icon, title, subtitle, optional action) reused by panels that don't use `EnmaxDataGrid` (e.g. detail panels).
- Verify the query-client config (`main.tsx`: `retry: 3`, `throwOnError: false`) and per-query options do not turn empty into error; empty must never trigger retry.

**Success:** every grid/panel shows an "add an entry"-style empty state on genuine 0 rows; errors only on real failures; no retry storm on empty.

### 2.3 De-duplicate filters (#1, #5, #6)
`EnmaxDataGrid` currently renders an in-grid per-column filter row. Remove that row; standardize on a single search box per grid. Grids affected: Reference Data, My Reservations, Audit. (Column sort stays; only the per-column filter text inputs are removed.)

---

## 3. Per-Screen Fixes

### 3.1 Audit Log (#5) — critical, must not hang
File: `features/audit/AuditPage.tsx`.

- **One Export CSV** button (remove the duplicate — page-level + grid built-in; keep one).
- **One search input** (remove duplicate header/column filter).
- **Subject Table** filter → **dropdown** of known subject tables (`enmax_autocaddrawing`, `enmax_autocadcheckout`, `enmax_autocadreservation`, the 12 reference tables), not free text.
- **Default date range = last 7 days** (currently 30).
- **Event pills color-coded** (semantic map, §5).
- **Explicit "Query" button** (next to Clear) — fetch on demand; do NOT auto-fetch on every keystroke/filter change.
- **Server-side paging** via OData `$top`/`$skip` (+ `$count`), page size from `usePageSize()`, with next/prev. Remove the 500-row bulk fetch. The grid pulls one page at a time based on active filters.

**Success:** filtering never bulk-loads; UI stays responsive at large data volumes; default view = last 7 days; pills colored; one Export, one search.

### 3.2 My Items / My Reservations (#1, #2)
File: `features/myitems/MyItemsPage.tsx`.

- **Remove the Actions column** from the reservations grid (no purpose).
- **Keep the standalone search box**; remove the grid's built-in quick-search (per 2.3, the in-grid filter row goes anyway).
- **Composition column → coded format** `GW-GN-00-AES-AAA-AC-???` (segment codes via the shared `formatComposition`/segment-code util, `???` = sequence placeholder), not full display text.
- **Rename the view** label to **"My Drawing Reservation"**.
- Pagination via `usePageSize()` (2.1).

### 3.3 Drawing detail flyout (#3)
File: `features/search/DrawingDetailPanel.tsx`.

- **Populate blank fields**: Current Revision, Revision Date, Sheets, Business, Asset, Unit, Domain, System, Kind, Record Type, Record Phase, Vendor, Requester. Root cause is the source `DrawingRow` (from `useSearchDrawings`) not selecting/expanding these columns. Fix by either (a) expanding the search query to include the composition lookups + revision/sheets/requester/vendor formatted values, or (b) fetching the full drawing record by id when the panel opens. Implementation picks whichever the search query supports cleanly; panel must show real values.
- **Activity timeline → sentence style** (#3): each row reads e.g. *"M365 Developer changed state from Available to Checked Out on 24 May 2026, 11:10."* Built from `enmax_acdnevent` label + `fromstate`/`tostate` (when present) + actor (`_enmax_acdnactedby_value@…FormattedValue`) + formatted timestamp. Reason shown below when present.

### 3.4 Approvals reservation flyout (#4)
File: `features/checkout/components/ReservationDrawingsPanel.tsx`.

- **Header** matches the reservation **details page** header: reservation number, coded composition, status pill, drawing count, requester, date. (Reuse the details-page header markup/component.)
- **Row actions → split button**: a primary action (state-appropriate, e.g. Check In / Check Out) + a **▾ overflow menu** holding the rest (Finalize, Mark Obsolete, Mark Void, Force Check In). Replaces the stacked-button column. The `DrawingActionsPanel` action set is unchanged; only the presentation becomes a split button.
- Pagination via `usePageSize()` (2.1).

### 3.5 Reference Data (#6, #8)
File: `features/referencedata/ReferenceDataPage.tsx`.

- **Polished table** (approved): code as monospace badge; real status pills (green Active / grey Inactive, inactive rows dimmed); zebra rows; toolbar with **count + active/inactive summary**; **single search box** (no in-grid filter row, per 2.3); actions as icon buttons (edit / activate-deactivate).
- Pagination via `usePageSize()` (2.1).
- **Add Row (#8):** Sort Order field **auto-defaults to next-max** for that table (max existing sort order + 10). User may edit it, but value **must be > 0** (reject 0; validation on save).

### 3.6 Settings / Single Admin Mode (#10)
File: `features/settings/SettingsPage.tsx`.

- Support **both enable and disable** (today it's enable-only). Button label/action reflects current `SingleAdminMode` config state.
- **Enabling** keeps the existing **acknowledgement/consent dialog** (it locks out end users from state-changing actions). Disabling returns the app to normal; a lighter confirm is acceptable but not required.
- Writes via `Enmax_autocadappconfigsService.update()` on the `SingleAdminMode` config row.

---

## 4. New Pages / Behavior

### 4.1 App Configuration admin page (#7)
New page under **Administration** nav. View/edit the `enmax_autocadappconfig` rows.

- List config keys with current value + type, editable per `AppConfigSchema` (`config/AppConfigSchema.ts`): booleans → toggle; integers → number input with min; strings/enums/colors → text/select with the schema's validation (regex/url/email).
- Save writes the row's `enmax_acdnvalue` (string-encoded per `enmax_acdnvaluetype`) via `Enmax_autocadappconfigsService`.
- Invalidate the `["app-config"]` query on save so the app picks up changes.
- Distinct from the user-prefs Settings page; admin-only.

### 4.2 Search (#11)
Files: `features/search/SearchPage.tsx`, header global search (`app/Header.tsx`), routes (`routes.tsx`).

- **Fix the Search page hang**: SearchPage currently stalls on "Loading…". Root-cause during implementation (likely `useSearchDrawings` never resolving / query firing with no/incorrect term, or a missing-`q` edge). Must resolve to results or a proper empty state (per 2.2).
- **"View all results for '<q>'"** (header dropdown) routes to a **unified search** covering **both drawings and reservations**, seeded with the query (tabs or a combined result set). The dropdown shows reservations today; the page must handle both entities so the link is meaningful.

---

## 5. Audit Event Pill Color Map (approved)

| Event | Colour | Rationale |
|---|---|---|
| Created (1) | green | new drawing |
| Approval Granted (3) | green | success |
| Finalized (9) | green | terminal, done |
| Approval Denied (4) | red | negative |
| Override Used (5) | amber | caution |
| Force Checked In (6) | amber | caution / admin override |
| State Changed (2) | info (grey-blue) | neutral transition |
| Config Changed (7) | info | neutral |
| Reference Data Changed (8) | info | neutral |

Use Fluent tokens (palette green / red / yellow-amber / informative-blue). No hardcoded hex outside the token system.

---

## 6. Out of Scope

- Dataverse schema / option-set changes (none needed).
- Admin App (model-driven) changes.
- New plugins or Custom APIs.
- Reworking the reservation **details page** itself (the flyout reuses its header; the page is unchanged).

---

## 7. Testing

- **Shared infra:** unit tests for `EnmaxDataGrid` empty-vs-error rendering (0 rows → empty state, not error; error → error) and that page size derives from `usePageSize()`.
- **Audit:** test default 7-day range, dropdown subject-table filter, Query-button gated fetch (no fetch until pressed), pill color mapping, paged fetch (one page at a time).
- **My Items / Reference Data:** coded composition rendering; no Actions column; Add Row sort-order default + `>0` validation.
- **Settings:** enable + disable paths; consent dialog on enable.
- **Search:** seeded query renders results / empty state (no hang); view-all routes with query for both entities.
- **App Config page:** edit + validation per schema; `["app-config"]` invalidated on save.
- Follow the repo's Vitest/RTL/MSW patterns. Verify with `npx tsc -b` (NOT `--noEmit`) + `npm run lint` + `npm test -- --run`.
