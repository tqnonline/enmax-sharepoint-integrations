# Plan #13 — UX & Admin Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-24
**Spec:** `2026-05-24-ux-admin-refinements-design.md`
**Branch:** `feat/013-ux-admin-refinements` → folds into PR #7 (or its own PR — decide at handoff)
**Base branch:** `worktree-feat+007-search-and-admin-surfaces` (the integrated plan-07 + plan-12 branch; these are refinements on top of it)

**Goal:** Fix 11 UX/admin issues in the Code App by building three shared primitives (config-driven pagination, empty-vs-error state, single-search grids) and applying them across screens, plus two small new admin surfaces (App Configuration editor, unified search) and an audit log that pages server-side.

**Architecture:** Shared-first. Tasks 1–3 add the reusable primitives; later tasks consume them. All work is in `apps/code-app`; no Dataverse schema/plugin changes. Audit gains OData `$top/$skip/$count` paging gated behind an explicit Query button.

**Tech Stack:** React 18 + TypeScript, Fluent UI v9, TanStack Query v5 + react-virtual, React Router (hash), Vitest + RTL + MSW. Generated Dataverse services in `src/generated/services`.

---

## Conventions (read first)

- **Verify TypeScript with `npx tsc -b`** (from `apps/code-app`), NOT `npx tsc --noEmit` — the root tsconfig has `files:[]` + project references, so `--noEmit` is a no-op. Lint = `npm run lint` (eslint, fails on errors only). Tests = `npm test -- --run`.
- **Pagination:** never hardcode a page size — use `usePageSize()` (`src/config/usePageSize.ts` → `GridPageSize`, default 10).
- **Colors:** Fluent tokens only; no hardcoded hex (the codebase enforces this).
- **Tests follow the repo pattern:** `src/__tests__/...`, `renderWithProviders`, MSW handlers in `src/__tests__/msw/handlers.ts`, hooks mocked with `vi.mock`. Match existing test files for shape.
- **Commit per task.** TDD: failing test → implement → green → commit.

---

## File Structure

**New files**
- `src/components/EmptyState.tsx` — shared empty-state (icon, title, subtitle, optional action). Used by grids + panels.
- `src/components/SplitButton.tsx` — primary action + ▾ overflow menu (Fluent `MenuButton`/`Menu`). Used by the approvals flyout.
- `src/features/admin/AppConfigPage.tsx` — App Configuration editor (admin).
- `src/features/admin/useAppConfigAdmin.ts` — fetch/update raw config rows for the editor.
- `src/features/search/useUnifiedSearch.ts` — search across drawings + reservations for the search page.
- Test files mirroring each under `src/__tests__/...`.

**Modified files**
- `src/components/DataGrid/EnmaxDataGrid.tsx` + `types.ts` — config pagination, `enableQuickSearch` prop, EmptyState integration, `emptyAction` prop.
- `src/features/myitems/MyItemsPage.tsx` — drop Actions column, coded composition, rename, single search, shared paging.
- `src/features/audit/AuditPage.tsx` — dedupe export/search, subject-table dropdown, 7-day default, colored pills, Query button, server paging.
- `src/features/audit/*` (audit row renderer) + `src/features/checkout/hooks/useDrawingAuditTrail.ts` consumer — sentence-style rows.
- `src/features/search/DrawingDetailPanel.tsx` — populate fields, sentence-style activity.
- `src/features/checkout/components/ReservationDrawingsPanel.tsx` — header parity, split-button actions, shared paging.
- `src/features/referencedata/ReferenceDataPage.tsx` (+ `RefRowPanel`) — polished table, single search, sort-order default + >0.
- `src/features/settings/SettingsPage.tsx` — single-admin enable+disable with consent.
- `src/features/search/SearchPage.tsx`, `src/app/Header.tsx`, `src/routes.tsx` — fix hang, unified view-all.
- `src/features/audit/auditPills.ts` (new small map) — event→color.

---

## Task 1: Shared config-driven pagination in EnmaxDataGrid

**Files:**
- Modify: `src/components/DataGrid/EnmaxDataGrid.tsx`
- Modify: `src/components/DataGrid/types.ts`
- Test: `src/__tests__/datagrid/EnmaxDataGrid.pagesize.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { EnmaxDataGrid } from "../../components/DataGrid/EnmaxDataGrid";
import type { ColumnDef } from "../../components/DataGrid/types";

vi.mock("../../config/useAppConfig", () => ({ useAppConfig: () => ({ GridPageSize: 2 }) }));
vi.mock("../../auth/useUserRole", () => ({ useUserRole: () => ({ role: "Admin", isPending: false }) }));

interface Row { id: string; name: string; }
const columns: ColumnDef<Row>[] = [{ id: "name", header: "Name", accessor: r => r.name }];

test("grid page size derives from GridPageSize config when no initialPageSize prop", async () => {
  // fetcher returns 5 rows, total 5; with page size 2 there must be 3 pages
  const fetcher = vi.fn().mockResolvedValue({
    rows: [{ id: "1", name: "a" }, { id: "2", name: "b" }],
    totalCount: 5,
  });
  renderWithProviders(
    <EnmaxDataGrid<Row> queryKey={["t"]} fetcher={fetcher} columns={columns} rowKey={r => r.id} />,
  );
  await screen.findByText("a");
  expect(await screen.findByText(/Page 1 of 3/)).toBeInTheDocument();
  // fetcher called with pageSize 2
  expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 2 }));
});
```

- [ ] **Step 2: Run — expect FAIL**

`cd apps/code-app && npm test -- --run src/__tests__/datagrid/EnmaxDataGrid.pagesize.test.tsx`
Expected: FAIL (page size still 50 → "Page 1 of 1"; fetcher called with pageSize 50).

- [ ] **Step 3: Implement**

In `types.ts`, make `initialPageSize` clearly optional (it already is `?`). No type change required; just stop defaulting to 50 in the component.

In `EnmaxDataGrid.tsx`:
- Add import: `import { usePageSize } from "../../config/usePageSize";`
- Replace the destructure default `initialPageSize = 50,` with `initialPageSize,` (no default).
- After `const isAdmin = …;` add: `const configPageSize = usePageSize(); const effectivePageSize = initialPageSize ?? configPageSize;`
- Pass `effectivePageSize` to `useGridState(defaultSort, effectivePageSize)`.
- Change `const pageCount = Math.ceil(total / initialPageSize);` → `const pageCount = Math.ceil(total / effectivePageSize);`

- [ ] **Step 4: Run — expect PASS**

`cd apps/code-app && npm test -- --run src/__tests__/datagrid/EnmaxDataGrid.pagesize.test.tsx`

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/code-app && npx tsc -b
git add src/components/DataGrid/EnmaxDataGrid.tsx src/components/DataGrid/types.ts src/__tests__/datagrid/EnmaxDataGrid.pagesize.test.tsx
git commit -m "feat(plan-13): EnmaxDataGrid page size derives from GridPageSize config"
```

---

## Task 2: Shared EmptyState component + empty-vs-error semantics

**Files:**
- Create: `src/components/EmptyState.tsx`
- Modify: `src/components/DataGrid/EnmaxDataGrid.tsx` + `types.ts`
- Test: `src/__tests__/datagrid/EnmaxDataGrid.empty.test.tsx`, `src/__tests__/components/EmptyState.test.tsx`

- [ ] **Step 1: Write failing tests**

`src/__tests__/components/EmptyState.test.tsx`:
```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { EmptyState } from "../../components/EmptyState";

test("renders title + subtitle and fires action", async () => {
  const onAdd = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(
    <EmptyState title="No reference data yet" subtitle="Add the first row to get started" actionLabel="Add Row" onAction={onAdd} />,
  );
  expect(screen.getByText("No reference data yet")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /add row/i }));
  expect(onAdd).toHaveBeenCalledOnce();
});
```

`src/__tests__/datagrid/EnmaxDataGrid.empty.test.tsx`:
```tsx
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { EnmaxDataGrid } from "../../components/DataGrid/EnmaxDataGrid";
import type { ColumnDef } from "../../components/DataGrid/types";

vi.mock("../../config/useAppConfig", () => ({ useAppConfig: () => ({ GridPageSize: 10 }) }));
vi.mock("../../auth/useUserRole", () => ({ useUserRole: () => ({ role: "Admin", isPending: false }) }));

interface Row { id: string; }
const columns: ColumnDef<Row>[] = [{ id: "id", header: "ID", accessor: r => r.id }];

test("genuine zero rows shows empty state, not an error", async () => {
  const fetcher = vi.fn().mockResolvedValue({ rows: [], totalCount: 0 });
  renderWithProviders(
    <EnmaxDataGrid<Row> queryKey={["e"]} fetcher={fetcher} columns={columns} rowKey={r => r.id}
      emptyMessage="No drawings yet" />,
  );
  expect(await screen.findByText("No drawings yet")).toBeInTheDocument();
  expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
});

test("fetch error shows error, not empty state", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
  renderWithProviders(
    <EnmaxDataGrid<Row> queryKey={["err"]} fetcher={fetcher} columns={columns} rowKey={r => r.id}
      emptyMessage="No drawings yet" errorMessage="Failed to load data." />,
  );
  expect(await screen.findByText("Failed to load data.")).toBeInTheDocument();
  expect(screen.queryByText("No drawings yet")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect FAIL** (`EmptyState` missing; grid empty still plain text)

- [ ] **Step 3: Implement EmptyState**

`src/components/EmptyState.tsx`:
```tsx
import { Button, Text, tokens, makeStyles } from "@fluentui/react-components";
import { DocumentRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";

const useStyles = makeStyles({
  wrap: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: tokens.spacingVerticalS, padding: tokens.spacingVerticalXXL, textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
  icon: { fontSize: "32px", color: tokens.colorNeutralForeground4 },
  title: { color: tokens.colorNeutralForeground2, fontWeight: tokens.fontWeightSemibold },
});

interface Props {
  title: string;
  subtitle?: string;
  icon?: ReactElement;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, subtitle, icon, actionLabel, onAction }: Props) {
  const styles = useStyles();
  return (
    <div className={styles.wrap}>
      <span className={styles.icon}>{icon ?? <DocumentRegular />}</span>
      <Text className={styles.title}>{title}</Text>
      {subtitle && <Text size={200}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <Button appearance="primary" onClick={onAction} style={{ marginTop: tokens.spacingVerticalS }}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire EmptyState into EnmaxDataGrid**

In `types.ts` add to `EnmaxDataGridProps<T>`:
```ts
  emptySubtitle?: string;
  emptyAction?: { label: string; onClick: () => void };
```
In `EnmaxDataGrid.tsx`:
- Import `EmptyState`.
- Destructure `emptySubtitle, emptyAction` from props.
- Replace the empty `<tr><td …>{emptyMessage}</td></tr>` block with a row whose single cell renders `<EmptyState title={emptyMessage} subtitle={emptySubtitle} actionLabel={emptyAction?.label} onAction={emptyAction?.onClick} />`. Keep `colSpan` logic.
- Confirm the empty branch is inside `!isPending && !isError` (already is) so empty never collides with error/loading.

- [ ] **Step 5: Run — expect PASS** (both test files)

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/code-app && npx tsc -b
git add src/components/EmptyState.tsx src/components/DataGrid/EnmaxDataGrid.tsx src/components/DataGrid/types.ts src/__tests__/components/EmptyState.test.tsx src/__tests__/datagrid/EnmaxDataGrid.empty.test.tsx
git commit -m "feat(plan-13): shared EmptyState; grid shows empty-vs-error correctly"
```

---

## Task 3: `enableQuickSearch` toggle on EnmaxDataGrid (single-search support)

**Files:**
- Modify: `src/components/DataGrid/EnmaxDataGrid.tsx` + `types.ts`
- Test: `src/__tests__/datagrid/EnmaxDataGrid.quicksearch.test.tsx`

Lets a screen with its own standalone search box (or no need for the toolbar search) hide the built-in quick-search, so there's exactly one search input. The per-column filter row already only renders when a column has `filterable: true`, so screens drop it by setting `filterable: false` on columns.

- [ ] **Step 1: Write failing test**

```tsx
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { EnmaxDataGrid } from "../../components/DataGrid/EnmaxDataGrid";
import type { ColumnDef } from "../../components/DataGrid/types";

vi.mock("../../config/useAppConfig", () => ({ useAppConfig: () => ({ GridPageSize: 10 }) }));
vi.mock("../../auth/useUserRole", () => ({ useUserRole: () => ({ role: "User", isPending: false }) }));

interface Row { id: string; }
const columns: ColumnDef<Row>[] = [{ id: "id", header: "ID", accessor: r => r.id }];

test("quick-search hidden when enableQuickSearch=false", async () => {
  const fetcher = vi.fn().mockResolvedValue({ rows: [], totalCount: 0 });
  renderWithProviders(
    <EnmaxDataGrid<Row> queryKey={["q"]} fetcher={fetcher} columns={columns} rowKey={r => r.id}
      enableQuickSearch={false} emptyMessage="none" />,
  );
  await screen.findByText("none");
  expect(screen.queryByLabelText("Quick search")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`types.ts`: add `enableQuickSearch?: boolean;` to `EnmaxDataGridProps<T>`.
`EnmaxDataGrid.tsx`: destructure `enableQuickSearch = true,`. Wrap the toolbar `<Input className={styles.searchBox} … aria-label="Quick search" />` in `{enableQuickSearch && ( … )}`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/code-app && npx tsc -b
git add src/components/DataGrid/EnmaxDataGrid.tsx src/components/DataGrid/types.ts src/__tests__/datagrid/EnmaxDataGrid.quicksearch.test.tsx
git commit -m "feat(plan-13): EnmaxDataGrid enableQuickSearch toggle for single-search screens"
```

---

## Task 4: Audit Log overhaul (#5)

**Files:**
- Create: `src/features/audit/auditPills.ts`
- Modify: `src/features/audit/AuditPage.tsx`
- Test: `src/__tests__/audit/AuditPage.test.tsx` (extend existing)

Current state (`AuditPage.tsx`): two Export CSV buttons (page-level line ~210 + grid `enableExport`), grid quick-search + per-column `filterable` on subjectTable/subjectId (the duplicate boxes), `filterTable` is a free-text `Input`, `DEFAULT_DAYS = 30`, event pills are `<Badge appearance="tint">`, fetcher auto-runs (queryKey includes live `deferredFilters`) and pulls `top: 500` then client-slices.

- [ ] **Step 1: Add the event→color map**

`src/features/audit/auditPills.ts`:
```ts
import type { BadgeProps } from "@fluentui/react-components";

// Semantic mapping approved in spec §5.
// green = positive, red = negative, amber = caution, informative = neutral.
export const AUDIT_EVENT_COLOR: Record<number, NonNullable<BadgeProps["color"]>> = {
  1: "success",      // Created
  2: "informative",  // State Changed
  3: "success",      // Approval Granted
  4: "danger",       // Approval Denied
  5: "warning",      // Override Used
  6: "warning",      // Force Checked In
  7: "informative",  // Config Changed
  8: "informative",  // Reference Data Changed
  9: "success",      // Finalized
};

export function auditEventColor(event: number): NonNullable<BadgeProps["color"]> {
  return AUDIT_EVENT_COLOR[event] ?? "subtle";
}
```
> If `"danger"` is not in the installed Fluent `BadgeProps["color"]` union, use `"important"`. Verify with `npx tsc -b`.

- [ ] **Step 2: Write/extend failing tests**

Extend `src/__tests__/audit/AuditPage.test.tsx`:
```tsx
test("default from-date is 7 days ago", () => {
  renderWithProviders(<AuditPage />);
  const from = screen.getByLabelText("From date") as HTMLInputElement;
  const expected = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  expect(from.value).toBe(expected);
});

test("Subject Table filter is a dropdown (combobox/select), not free text", () => {
  renderWithProviders(<AuditPage />);
  const el = screen.getByLabelText("Filter by subject table");
  expect(el.tagName.toLowerCase()).toBe("select");
});

test("data is not fetched until Query is pressed", async () => {
  renderWithProviders(<AuditPage />);
  // Before Query: grid shows an idle/empty prompt, not rows
  expect(screen.getByRole("button", { name: /query/i })).toBeInTheDocument();
});

test("single Export CSV button", () => {
  mockRole.value = "Admin";
  renderWithProviders(<AuditPage />);
  expect(screen.getAllByRole("button", { name: /export csv/i })).toHaveLength(1);
});
```
(Reuse the existing test file's `mockRole`, MSW handler for `enmax_autocadauditevents`, and `renderWithProviders`. Adjust the "30 days" test already present → 7 days.)

- [ ] **Step 3: Run — expect FAIL**

`cd apps/code-app && npm test -- --run src/__tests__/audit/AuditPage.test.tsx`

- [ ] **Step 4: Implement AuditPage changes**

1. `const DEFAULT_DAYS = 30;` → `= 7;`
2. **Subject Table dropdown**: replace the `filterTable` `<Input …>` with a `<Select aria-label="Filter by subject table">` whose options are the known subject tables:
```tsx
        <Field label="Subject Table">
          <Select value={filterTable} onChange={(_, d) => setFilterTable(d.value)} aria-label="Filter by subject table">
            <option value="">All tables</option>
            <option value="enmax_autocaddrawing">Drawing</option>
            <option value="enmax_autocadcheckout">Checkout</option>
            <option value="enmax_autocadreservation">Reservation</option>
            <option value="enmax_autocadbusiness">Business</option>
            <option value="enmax_autocadasset">Asset</option>
            <option value="enmax_autocadunit">Unit</option>
            <option value="enmax_autocaddomain">Domain</option>
            <option value="enmax_autocadsystem">System</option>
            <option value="enmax_autocadkind">Kind</option>
            <option value="enmax_autocadrecordtype">Record Type</option>
            <option value="enmax_autocadrecordphase">Record Phase</option>
            <option value="enmax_autocadvendor">Vendor</option>
          </Select>
        </Field>
```
3. **Colored pills**: in `AUDIT_COLS`, change the `eventLabel` cell to `cell: r => <Badge appearance="filled" color={auditEventColor(r.event)}>{r.eventLabel}</Badge>` and import `auditEventColor`.
4. **Explicit Query button + applied filters**: add `const [applied, setApplied] = useState({ dateFrom: defaultFrom, dateTo: "", filterEvent: "", filterTable: "", filterSubjectId: "", filterSource: "" });`. Drive the fetcher + grid `queryKey` from `applied`, NOT the live `deferredFilters`. Add a primary **Query** button before Clear: `<Button appearance="primary" icon={<SearchRegular/>} onClick={() => setApplied({ dateFrom, dateTo, filterEvent, filterTable, filterSubjectId, filterSource })}>Query</Button>`. Keep the default applied state = last-7-days so the first view shows recent events. `clearFilters` resets both live inputs and `applied` to defaults.
5. **Single Export**: set the grid prop `enableExport={false}` (keep the page-level Export button). 
6. **Single search / no duplicate boxes**: set `enableQuickSearch={false}` on the grid (Task 3) and remove `filterable: true` from the `subjectTable` and `subjectId` columns in `AUDIT_COLS` (the page filter Fields are the single filter set). Drop the now-unused client `params.search` filter block in the fetcher.
7. **Server-side paging (no hang)**: rewrite the fetcher to page server-side instead of `top: 500` + client slice:
```tsx
    const result = await Enmax_autocadauditeventsService.getAll({
      filter:  clauses.length ? clauses.join(" and ") : undefined,
      select:  [ /* same select list */ ],
      orderBy: ["createdon desc"],
      top:     params.pageSize,
      skip:    params.page * params.pageSize,
      count:   true,
    });
    if (!result.success) throw new Error("Audit fetch failed");
    const rows = (result.data ?? []).map(r => toAuditRow(r as AuditRaw));
    const totalCount = result.count ?? rows.length;
    return { rows, totalCount };
```
> Verify the generated `Enmax_autocadauditeventsService.getAll` supports `skip` + `count` (returns `@odata.count` as `result.count`). If it does NOT expose `skip`/`count`, add them via the underlying client options the service wraps (check `src/generated/services`). If `count` is unavailable, fetch `top: params.pageSize + 1` to detect "has next" and pass `totalCount = params.page*params.pageSize + rows.length + (hasMore?1:0)` so pagination's Next stays enabled correctly. Keep the implementation server-paged — do NOT reintroduce a 500-row bulk fetch.
   The grid `queryKey` must include `params` (already does via deferred params) AND `applied`. Keep export using a bounded server-paged loop (the existing `exportToCsv` calls the fetcher with a large pageSize; cap at 10000 — acceptable for export only).

- [ ] **Step 5: Run — expect PASS**; then full file: `npm test -- --run src/__tests__/audit/AuditPage.test.tsx`

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/code-app && npx tsc -b
git add src/features/audit/auditPills.ts src/features/audit/AuditPage.tsx src/__tests__/audit/AuditPage.test.tsx
git commit -m "feat(plan-13): audit log — 7-day default, subject-table dropdown, colored pills, Query button, server paging, single export/search"
```

---

## Task 5: My Items — My (Drawing) Reservations (#1, #2)

**Files:**
- Modify: `src/features/myitems/MyItemsPage.tsx`
- Test: `src/__tests__/myitems/MyItemsPage.test.tsx` (create or extend)

Current state: reservations grid has `rowActions={resActions}` (a Cancel action → renders the Actions column), columns `reservationNumber` + `status` are `filterable: true` (→ the per-column filter row, the second "box" beside the grid quick-search), composition column (RES_COLUMNS `composition`) is ALREADY coded (`GW-…-???`), tab labeled "My Reservations". Pagination is inherited from EnmaxDataGrid (Task 1 already makes it config-driven — no change here).

- [ ] **Step 1: Write failing test**

```tsx
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { MyItemsPage } from "../../features/myitems/MyItemsPage";

vi.mock("../../auth/useCurrentUser", () => ({ useCurrentUser: () => ({ data: { id: "u1" } }) }));
vi.mock("../../features/myitems/useMyReservations", async (orig) => ({
  ...(await orig()),
  fetchMyReservationRows: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
  useCancelReservation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../features/myitems/useMyCheckouts", async (orig) => ({
  ...(await orig()),
  fetchMyCheckoutRows: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
}));
vi.mock("../../config/useAppConfig", () => ({ useAppConfig: () => ({ GridPageSize: 10 }) }));
vi.mock("../../auth/useUserRole", () => ({ useUserRole: () => ({ role: "User", isPending: false }) }));

test("reservations tab is labelled 'My Drawing Reservation'", () => {
  renderWithProviders(<MyItemsPage />);
  expect(screen.getByRole("tab", { name: "My Drawing Reservation" })).toBeInTheDocument();
});

test("reservations grid has no Actions column header", async () => {
  renderWithProviders(<MyItemsPage />);
  await screen.findByText("No reservations found.");
  expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test -- --run src/__tests__/myitems/MyItemsPage.test.tsx`)

- [ ] **Step 3: Implement**

1. **Remove Actions column**: delete the `rowActions={resActions}` prop from the reservations `EnmaxDataGrid`, and delete the now-unused `resActions` array + `handleCancel`/`cancelMutation` if nothing else uses them. (Cancel for a pending reservation remains available on the reservation **details page** via the existing `onRowClick → /reservations/:id`. Verify the details page exposes Cancel; if it does not, leave `cancelMutation` wired there — out of scope to build, but note in the PR.)
2. **Single search**: remove `filterable: true` (and any `filterType`/`filterOptions`) from `RES_COLUMNS` `reservationNumber` and `status` columns so the per-column filter row disappears; keep the grid's quick-search (the single search box). Do the same for `CHK_COLUMNS` (`drawingNumber`, `drawingTitle`) for consistency.
3. **Rename**: `<Tab value="reservations">My Reservations</Tab>` → `<Tab value="reservations">My Drawing Reservation</Tab>`.
4. **Composition (#2)**: the `composition` column already renders the coded `GW-…-???` form. Confirm `r.businessCode`/`assetCode`/… are populated by `fetchMyReservationRows` (in `useMyReservations.ts`). If they come back blank or as display names, fix that mapping to use the reference **codes**. If already coded (likely), no change.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/code-app && npx tsc -b
git add src/features/myitems/MyItemsPage.tsx src/__tests__/myitems/MyItemsPage.test.tsx
git commit -m "feat(plan-13): My Drawing Reservation — drop Actions column, single search, rename, coded composition"
```

---

## Task 6: Settings — Single Admin Mode enable + disable with consent (#10)

**Files:**
- Modify: `src/features/settings/SettingsPage.tsx`
- Test: `src/__tests__/settings/SettingsPage.test.tsx` (extend existing)

Current state: the button is enable-only (`disabled={… || config.SingleAdminMode}`, label "Active" when on), the consent dialog only enables, and there's no `["app-config"]` invalidation so the UI won't reflect the change without a reload. The dialog text claims it "cannot be undone from the app".

- [ ] **Step 1: Write failing tests**

```tsx
test("shows Disable when Single Admin Mode is on", () => {
  mockRole.value = "Admin";
  mockConfig.SingleAdminMode = true;
  renderWithProviders(<SettingsPage />);
  expect(screen.getByRole("button", { name: /disable single admin mode/i })).toBeEnabled();
});

test("shows Enable when Single Admin Mode is off", () => {
  mockRole.value = "Admin";
  mockConfig.SingleAdminMode = false;
  renderWithProviders(<SettingsPage />);
  expect(screen.getByRole("button", { name: /enable single admin mode/i })).toBeInTheDocument();
});
```
(Use the existing settings test's `mockRole`/`mockConfig` mocks of `useUserRole`/`useAppConfig`; mock `Enmax_autocadappconfigsService`.)

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

1. Generalize the writer:
```tsx
  const queryClient = useQueryClient(); // import { useQueryClient } from "@tanstack/react-query"
  async function setSingleAdminMode(next: boolean) {
    setSavingAdminMode(true);
    setSingleAdminConfirmOpen(false);
    try {
      const rows = await Enmax_autocadappconfigsService.getAll({
        filter: "enmax_acdnkey eq 'SingleAdminMode'",
        select: ["enmax_autocadappconfigid"],
      });
      const id = rows.data?.[0]?.enmax_autocadappconfigid;
      if (!id) { dispatchToast(<Toast><ToastTitle>Config row 'SingleAdminMode' not found — seed it first.</ToastTitle></Toast>, { intent: "error" }); return; }
      await Enmax_autocadappconfigsService.update(id, { enmax_acdnvalue: next ? "true" : "false" } as Parameters<typeof Enmax_autocadappconfigsService.update>[1]);
      await queryClient.invalidateQueries({ queryKey: ["app-config"] });
      dispatchToast(<Toast><ToastTitle>Single Admin Mode {next ? "enabled" : "disabled"}.</ToastTitle></Toast>, { intent: next ? "warning" : "success" });
    } catch {
      dispatchToast(<Toast><ToastTitle>Failed to update Single Admin Mode.</ToastTitle></Toast>, { intent: "error" });
    } finally { setSavingAdminMode(false); }
  }
```
2. Button reflects state and is not disabled (except while saving):
```tsx
                <Button
                  appearance={config.SingleAdminMode ? "secondary" : "primary"}
                  disabled={savingAdminMode}
                  onClick={() => config.SingleAdminMode ? void setSingleAdminMode(false) : setSingleAdminConfirmOpen(true)}
                  aria-label={config.SingleAdminMode ? "Disable Single Admin Mode" : "Enable Single Admin Mode"}
                >
                  {config.SingleAdminMode ? "Disable" : "Enable"}
                </Button>
```
3. Consent dialog stays for **enable only**; update its body text (remove "cannot be undone from the app"):
```tsx
            <DialogContent>
              All end users will be locked out of state-changing actions until you disable Single Admin Mode. Continue?
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setSingleAdminConfirmOpen(false)}>Cancel</Button>
              <Button appearance="primary" onClick={() => void setSingleAdminMode(true)}>Enable</Button>
            </DialogActions>
```
Remove the old `enableSingleAdminMode` name (replaced by `setSingleAdminMode`).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/code-app && npx tsc -b
git add src/features/settings/SettingsPage.tsx src/__tests__/settings/SettingsPage.test.tsx
git commit -m "feat(plan-13): Single Admin Mode enable+disable with consent on enable; invalidate app-config"
```

---

## Task 7: Reference Data redesign + Add-Row sort order (#6, #8)

**Files:**
- Modify: `src/features/referencedata/ReferenceDataPage.tsx`
- Modify: `src/features/referencedata/RefRowPanel.tsx`
- Create: `src/features/referencedata/useNextSortOrder.ts`
- Test: `src/__tests__/referencedata/RefRowPanel.test.tsx` (extend/create)

Current: `REF_COLUMNS` has `filterable` on code/displayName/statecode (the in-grid filter row), status pill is `appearance="tint"`, code is plain `<Text weight="semibold">`. `RefRowPanel` schema `sortOrder: z.number().int().min(0)`, add-default `sortOrder: 0`. Pagination inherited from Task 1. Row actions already render as icon buttons.

- [ ] **Step 1 (#6 polish): REF_COLUMNS**

In `ReferenceDataPage.tsx`:
- **Code badge**: `cell: r => <Badge appearance="filled" color="informative" style={{ fontFamily: "monospace" }}>{r.code}</Badge>` for the `code` column.
- **Status pill**: `cell: r => <Badge appearance="filled" color={r.statecode === 0 ? "success" : "subtle"}>{r.statecode === 0 ? "Active" : "Inactive"}</Badge>`.
- **Single search**: remove `filterable: true` / `filterType` / `filterOptions` from all `REF_COLUMNS` columns (drops the filter row; the grid quick-search remains the single search box).

- [ ] **Step 2 (#6 summary): count/active-inactive in the toolbar**

Create `src/features/referencedata/useNextSortOrder.ts` (also exporting a summary hook to avoid a second file):
```ts
import { useQuery } from "@tanstack/react-query";
import type { RefTableConfig } from "./tableConfig";
import { fetchRefTableSummary, fetchMaxSortOrder } from "./useRefTableData";

// Active/inactive counts for the toolbar summary.
export function useRefTableSummary(config: RefTableConfig) {
  return useQuery({
    queryKey: ["ref-summary", config.entityName],
    queryFn: () => fetchRefTableSummary(config),
    staleTime: 30_000,
  });
}

// Next sort order = max existing + 10 (or 10 when table is empty).
export function useNextSortOrder(config: RefTableConfig) {
  return useQuery({
    queryKey: ["ref-next-sort", config.entityName],
    queryFn: async () => (await fetchMaxSortOrder(config)) + 10,
  });
}
```
Add `fetchRefTableSummary` (returns `{ total, active, inactive }`) and `fetchMaxSortOrder` (returns the max sort-order value, 0 if none) to `useRefTableData.ts`, using the generated service `getAll` with `count: true` and the table's sort-order attribute + `statecode` filters. (Reuse the existing `makeRefTableFetcher` column mapping to know the sort-order attribute name.)

In the toolbar (next to the table title), render the summary:
```tsx
const summary = useRefTableSummary(config);
// …
<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
  {summary.data ? `${summary.data.total} codes · ${summary.data.active} active · ${summary.data.inactive} inactive` : ""}
</Text>
```

- [ ] **Step 3 (#8): sort-order default + >0 — write failing test**

`src/__tests__/referencedata/RefRowPanel.test.tsx`:
```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { RefRowPanel } from "../../features/referencedata/RefRowPanel";

test("Add Row defaults Sort Order to provided next value and rejects 0", async () => {
  const onSave = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(
    <RefRowPanel open editing={null} nextSortOrder={70} onClose={() => {}} onSave={onSave} isSaving={false} />,
  );
  const sort = screen.getByRole("spinbutton", { name: /sort order/i }) as HTMLInputElement;
  expect(sort.value).toBe("70");
  // typing 0 then saving must show a validation error and not call onSave
  await user.clear(sort);
  await user.type(sort, "0");
  await user.type(screen.getByLabelText(/^code/i), "XX");
  await user.type(screen.getByLabelText(/display name/i), "Test");
  await user.click(screen.getByRole("button", { name: /save/i }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText(/greater than 0/i)).toBeInTheDocument();
});
```

- [ ] **Step 4: Run — expect FAIL**

- [ ] **Step 5 (#8): implement RefRowPanel**

- Add `nextSortOrder?: number;` to `RefRowPanelProps`.
- Schema: `sortOrder: z.number().int().min(1, "Sort order must be greater than 0")`.
- Add-mode default uses `nextSortOrder`: in the `useEffect`, `else reset({ code: "", displayName: "", description: "", sortOrder: nextSortOrder ?? 10 });` and the `useForm` defaultValues `sortOrder: nextSortOrder ?? 10`. Add `nextSortOrder` to the effect deps.
- `<Input … type="number" min={1} />`.

In `ReferenceDataPage.tsx`: `const nextSort = useNextSortOrder(config);` and pass `nextSortOrder={nextSort.data ?? 10}` to `<RefRowPanel …>`. Invalidate `["ref-next-sort", …]` + `["ref-summary", …]` in `handleSave`/`handleDeactivate` success (so they refresh).

- [ ] **Step 6: Run — expect PASS**

- [ ] **Step 7: Typecheck + commit**

```bash
cd apps/code-app && npx tsc -b
git add src/features/referencedata/ src/__tests__/referencedata/RefRowPanel.test.tsx
git commit -m "feat(plan-13): Reference Data polish (badges, pills, single search, summary) + sort-order auto-default >0"
```

---

## Task 8: Drawing detail flyout — populate fields + sentence-style activity (#3)

**Files:**
- Create: `src/features/search/useDrawingDetail.ts`
- Modify: `src/features/checkout/hooks/useDrawingAuditTrail.ts`
- Create: `src/features/checkout/hooks/auditSentence.ts`
- Modify: `src/features/search/DrawingDetailPanel.tsx`
- Test: `src/__tests__/search/DrawingDetailPanel.test.tsx`, `src/__tests__/checkout/auditSentence.test.ts`

**Root cause:** the panel renders fields straight from the passed `DrawingRow`. When opened from My Items checkouts, that row is synthetic (`makeDrawingRow` — all `*Display` empty, revision "", sheets 0). The audit hook doesn't select from/to states and the timeline shows a badge + actor·date, not a sentence.

- [ ] **Step 1: `useDrawingDetail` — fetch the full drawing by id (with formatted values)**

`src/features/search/useDrawingDetail.ts`:
```ts
import { useQuery } from "@tanstack/react-query";
import { Enmax_autocaddrawingsService } from "../../generated";
import type { DrawingRow } from "./useSearchDrawings";

// Fetches ONE drawing fully populated (composition display names, revision, sheets,
// requester, vendor) so the detail panel never shows blanks regardless of how it was opened.
export function useDrawingDetail(id?: string) {
  return useQuery<DrawingRow | null>({
    queryKey: ["drawing-detail", id],
    enabled: !!id,
    staleTime: 30_000,
    throwOnError: false,
    queryFn: async () => {
      const result = await Enmax_autocaddrawingsService.getAll({
        filter: `enmax_autocaddrawingid eq '${id}'`,
        select: [
          "enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdntitle",
          "enmax_acdncurrentrevision", "enmax_acdnrevisiondate", "enmax_acdnstate",
          "enmax_acdnsheetcount", "enmax_acdnsplibraryurl",
          "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
          "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
          "_enmax_acdnrecordtype_value", "_enmax_acdnrecordphase_value",
          "_enmax_acdnvendor_value", "_createdby_value",
        ],
        top: 1,
      });
      if (!result.success || !result.data?.length) return null;
      const r = result.data[0] as Record<string, unknown>;
      const fv = (k: string) => (r[`${k}@OData.Community.Display.V1.FormattedValue`] as string) ?? "";
      return {
        id: r["enmax_autocaddrawingid"] as string,
        enmax_acdnnumber: (r["enmax_acdnnumber"] as string) ?? "",
        enmax_acdntitle: (r["enmax_acdntitle"] as string) ?? "",
        enmax_acdncurrentrevision: (r["enmax_acdncurrentrevision"] as string) ?? "",
        enmax_acdnrevisiondate: (r["enmax_acdnrevisiondate"] as string) ?? "",
        enmax_acdnstate: (r["enmax_acdnstate"] as number) ?? 0,
        enmax_acdnsheetcount: (r["enmax_acdnsheetcount"] as number) ?? 0,
        enmax_acdnsplibraryurl: (r["enmax_acdnsplibraryurl"] as string) ?? "",
        _enmax_acdnbusiness_value: "", _enmax_acdnasset_value: "", _enmax_acdnunit_value: "",
        _enmax_acdndomain_value: "", _enmax_acdnsystem_value: "", _enmax_acdnkind_value: "",
        _enmax_acdnrecordtype_value: "", _enmax_acdnrecordphase_value: "", _enmax_acdnvendor_value: "",
        _createdby_value: "",
        businessDisplay: fv("_enmax_acdnbusiness_value"), assetDisplay: fv("_enmax_acdnasset_value"),
        unitDisplay: fv("_enmax_acdnunit_value"), domainDisplay: fv("_enmax_acdndomain_value"),
        systemDisplay: fv("_enmax_acdnsystem_value"), kindDisplay: fv("_enmax_acdnkind_value"),
        recordTypeDisplay: fv("_enmax_acdnrecordtype_value"), recordPhaseDisplay: fv("_enmax_acdnrecordphase_value"),
        vendorDisplay: fv("_enmax_acdnvendor_value"), requesterDisplay: fv("_createdby_value"),
      } as DrawingRow;
    },
  });
}
```
> If the `@…FormattedValue` annotations come back empty (some Web API clients need `Prefer: odata.include-annotations="*"`), add that preference via the generated service's options. The existing `fetchSearchDrawings` maps the same annotations, so the client likely returns them; verify in dev.

- [ ] **Step 2: Sentence builder + extend audit hook**

`src/features/checkout/hooks/auditSentence.ts`:
```ts
import type { AuditEvent } from "./useDrawingAuditTrail";

const VERB: Record<string, string> = {
  "Created": "created the drawing",
  "State Changed": "changed state",
  "Approval Granted": "approved the revision",
  "Approval Denied": "declined the revision",
  "Force Checked In": "force-checked-in the drawing",
  "Finalized": "finalized the drawing",
};

export function formatAuditSentence(ev: AuditEvent): string {
  const who  = ev.actedBy || "Someone";
  const verb = VERB[ev.eventLabel] ?? ev.eventLabel.toLowerCase();
  const transition = ev.fromState && ev.toState ? ` from ${ev.fromState} to ${ev.toState}` : "";
  const when = ev.createdOn ? new Date(ev.createdOn).toLocaleString() : "";
  return `${who} ${verb}${transition}${when ? ` on ${when}` : ""}.`;
}
```

In `useDrawingAuditTrail.ts`:
- Extend `AuditEvent` with `event: number; fromState: string; toState: string;`.
- Add to the `select`: `"enmax_acdnfromstate", "enmax_acdntostate"`.
- Add `9: "Finalized"` to `EVENT_LABELS`.
- Map `event`, `fromState: raw["enmax_acdnfromstate"] ?? ""`, `toState: raw["enmax_acdntostate"] ?? ""`.

- [ ] **Step 3: Write failing tests**

`src/__tests__/checkout/auditSentence.test.ts`:
```ts
import { formatAuditSentence } from "../../features/checkout/hooks/auditSentence";

test("state-change reads as a sentence with from→to, date, actor", () => {
  const s = formatAuditSentence({
    id: "1", event: 2, eventLabel: "State Changed",
    fromState: "Available", toState: "Checked Out",
    actedBy: "M365 Developer", reason: "", createdOn: "2026-05-24T11:10:00Z",
  });
  expect(s).toMatch(/^M365 Developer changed state from Available to Checked Out on .+\.$/);
});

test("event without states omits the transition clause", () => {
  const s = formatAuditSentence({
    id: "2", event: 1, eventLabel: "Created", fromState: "", toState: "",
    actedBy: "Alice", reason: "", createdOn: "2026-05-24T10:00:00Z",
  });
  expect(s).toContain("Alice created the drawing on");
  expect(s).not.toContain("from");
});
```

`src/__tests__/search/DrawingDetailPanel.test.tsx` (key assertions; mock `useDrawingDetail` to return a fully-populated row, `useDrawingAuditTrail` to return one state-change event, `useDrawingCheckout` undefined):
```tsx
test("renders populated composition + sentence-style activity", async () => {
  // mock useDrawingDetail → { businessDisplay: "Generation", requesterDisplay: "M365 Developer", enmax_acdnsheetcount: 3, ... }
  // mock useDrawingAuditTrail → [{ eventLabel:"State Changed", fromState:"Available", toState:"Checked Out", actedBy:"M365 Developer", createdOn:"...", event:2, reason:"" }]
  renderWithProviders(<DrawingDetailPanel drawing={baseRow} onClose={() => {}} />);
  expect(await screen.findByText("Generation")).toBeInTheDocument();          // Business populated
  expect(screen.getByText(/changed state from Available to Checked Out/)).toBeInTheDocument();
});
```

- [ ] **Step 4: Run — expect FAIL**

- [ ] **Step 5: Wire the panel**

In `DrawingDetailPanel.tsx`:
- `const { data: detail, isPending } = useDrawingDetail(drawing?.id);`
- Use `const d = detail ?? drawing;` for the meta fields (so the header shows instantly from the passed row, fields fill once `detail` loads). Show a small `<Spinner>` in the meta area while `isPending && !detail`.
- Replace the timeline item body with the sentence: `<Text size={200}>{formatAuditSentence(ev)}</Text>` (keep the colored `<Badge color={auditEventColor(ev.event)}>` from Task 4's map as a small leading tag, and the reason line below when present).

- [ ] **Step 6: Run — expect PASS**

- [ ] **Step 7: Typecheck + commit**

```bash
cd apps/code-app && npx tsc -b
git add src/features/search/useDrawingDetail.ts src/features/checkout/hooks/useDrawingAuditTrail.ts src/features/checkout/hooks/auditSentence.ts src/features/search/DrawingDetailPanel.tsx src/__tests__/checkout/auditSentence.test.ts src/__tests__/search/DrawingDetailPanel.test.tsx
git commit -m "feat(plan-13): drawing detail fetches full record on open; sentence-style activity with from→to"
```

---

## Task 9: Approvals reservation flyout — header parity + split-button actions (#4)

**Files:**
- Create: `src/components/SplitButton.tsx`
- Modify: `src/features/checkout/components/DrawingActionsPanel.tsx`
- Modify: `src/features/checkout/components/{FinalizeDialog,MarkObsoleteDialog,MarkVoidDialog,ForceCheckInDialog}.tsx` (controllable)
- Modify: `src/features/checkout/components/ReservationDrawingsPanel.tsx`
- Test: `src/__tests__/components/SplitButton.test.tsx`, `src/__tests__/checkout/DrawingActionsPanel.test.tsx` (extend)

Current: the flyout's actions cell renders `<DrawingActionsPanel …>` which (per plan-12) shows an inline `actionRow` of buttons (e.g. Available → Check Out + Finalize + admin Obsolete/Void) — dense in a multi-row grid. Header shows reservation number, composition, count, status badge.

- [ ] **Step 1: Generic SplitButton (primary + ▾ overflow)**

`src/components/SplitButton.tsx`:
```tsx
import { Button, Menu, MenuTrigger, MenuButton, MenuPopover, MenuList, MenuItem, makeStyles, tokens } from "@fluentui/react-components";
import type { ReactNode } from "react";

export interface SplitMenuItem { key: string; label: string; onClick: () => void; disabled?: boolean; }

const useStyles = makeStyles({
  group: { display: "inline-flex" },
  primary: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  caret: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: `1px solid ${tokens.colorTransparentStroke}`, minWidth: "auto", padding: `0 ${tokens.spacingHorizontalXS}` },
});

interface Props {
  primaryLabel: string;
  primaryIcon?: ReactNode;
  onPrimary: () => void;
  appearance?: "primary" | "secondary" | "outline";
  items: SplitMenuItem[];
}

export function SplitButton({ primaryLabel, primaryIcon, onPrimary, appearance = "primary", items }: Props) {
  const styles = useStyles();
  return (
    <div className={styles.group}>
      <Button appearance={appearance} icon={primaryIcon} className={styles.primary} onClick={onPrimary}>{primaryLabel}</Button>
      {items.length > 0 && (
        <Menu positioning="below-end">
          <MenuTrigger disableButtonEnhancement>
            <MenuButton appearance={appearance} className={styles.caret} aria-label="More actions" />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {items.map(i => <MenuItem key={i.key} disabled={i.disabled} onClick={i.onClick}>{i.label}</MenuItem>)}
            </MenuList>
          </MenuPopover>
        </Menu>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Make the secondary dialogs controllable**

Each of `FinalizeDialog`, `MarkObsoleteDialog`, `MarkVoidDialog`, `ForceCheckInDialog` currently owns its trigger `<Button>` + `open` state. Add optional controlled props so a menu can open them without rendering their own button:
```tsx
interface Props { drawingId: string; /* (ForceCheckIn also checkoutId, currentRevision) */
  open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean; }
```
- When `open`/`onOpenChange` are provided, use them instead of internal state.
- When `hideTrigger` is true, render only the `<Dialog>` (no trigger button).
Keep current behavior when the props are absent (uncontrolled, with trigger) — so existing usages are unchanged.

- [ ] **Step 3: `variant="split"` on DrawingActionsPanel**

Add `variant?: "inline" | "split"` (default `"inline"`). In `"split"` mode, for the Available and CheckedOut(others) branches, render a `<SplitButton>` whose **primary** is the main action (Check Out / Force Check In) and whose **overflow items** open the secondary dialogs (Finalize, Mark Obsolete, Mark Void) via their new controlled `open` props. Implement with local `useState` for which secondary dialog is open, e.g.:
```tsx
const [openDialog, setOpenDialog] = useState<null | "finalize" | "obsolete" | "void">(null);
// …Available + variant==="split":
return (
  <>
    <SplitButton primaryLabel="Check Out" onPrimary={() => checkOutMutation… /* reuse CheckOutButton's action */}
      items={[
        { key: "finalize", label: "Finalize", onClick: () => setOpenDialog("finalize") },
        ...(isAdmin ? [{ key: "obsolete", label: "Mark Obsolete", onClick: () => setOpenDialog("obsolete") },
                       { key: "void", label: "Mark Void", onClick: () => setOpenDialog("void") }] : []),
      ]} />
    <FinalizeDialog drawingId={drawing.id} hideTrigger open={openDialog === "finalize"} onOpenChange={o => setOpenDialog(o ? "finalize" : null)} />
    <MarkObsoleteDialog drawingId={drawing.id} hideTrigger open={openDialog === "obsolete"} onOpenChange={o => setOpenDialog(o ? "obsolete" : null)} />
    <MarkVoidDialog drawingId={drawing.id} hideTrigger open={openDialog === "void"} onOpenChange={o => setOpenDialog(o ? "void" : null)} />
  </>
);
```
For the primary "Check Out", reuse the existing checkout action (extract the `useCheckOut().mutate(drawing.id)` call that `CheckOutButton` uses, or render `CheckOutButton` as primary and only the overflow as a separate `Menu`). The `"inline"` default path is unchanged (existing plan-12 matrix). Keep all role gating identical.

- [ ] **Step 4: Flyout uses split variant + header parity**

In `ReservationDrawingsPanel.tsx`:
- The `actions` column `renderCell`: `<DrawingActionsPanel drawing={drawing} openCheckout={checkout} variant="split" />`.
- **Header parity**: extend the drawer header to match the reservation **details page** header — show reservation number, **coded composition** (reuse `formatComposition(reservation)`), status badge, drawing count, **requester**, **submitted date**. (Mirror the fields/markup from `src/pages/ReservationDetail.tsx`'s header; reuse its header sub-component if one exists, else replicate the field list.)
- Paging already uses `usePageSize()`.

- [ ] **Step 5: Tests**

`SplitButton.test.tsx`: primary onClick fires; overflow menu opens and a menu item fires its onClick.
Extend `DrawingActionsPanel.test.tsx`: with `variant="split"` on an Available drawing as Admin, the primary "Check Out" shows and the ▾ menu lists Finalize/Mark Obsolete/Mark Void; clicking "Mark Void" opens the void dialog (assert "Confirm Void" appears).

- [ ] **Step 6: Run — expect PASS** (`npm test -- --run` for the two files)

- [ ] **Step 7: Typecheck + full suite + commit**

```bash
cd apps/code-app && npx tsc -b && npm test -- --run
git add src/components/SplitButton.tsx src/features/checkout/components/ src/__tests__/components/SplitButton.test.tsx src/__tests__/checkout/DrawingActionsPanel.test.tsx
git commit -m "feat(plan-13): approvals flyout — split-button row actions + reservation-detail header parity"
```

---

## Task 10: App Configuration admin page (#7)

**Files:**
- Create: `src/features/admin/useAppConfigAdmin.ts`
- Create: `src/features/admin/AppConfigPage.tsx`
- Create: `src/pages/AppConfig.tsx` (thin route wrapper, matching the other `src/pages/*` wrappers)
- Modify: `src/routes.tsx` (+ the nav in `src/app/AppShell.tsx`)
- Test: `src/__tests__/admin/AppConfigPage.test.tsx`

Config rows live in `enmax_autocadappconfig` (key `enmax_acdnkey`, value `enmax_acdnvalue` string-encoded, type `enmax_acdnvaluetype`: 1=BOOLEAN 2=INTEGER 3=STRING 4=JSON). Read shape is in `useAppConfig.ts`; validation lives in `AppConfigSchema.ts`.

- [ ] **Step 1: Admin data hook**

`src/features/admin/useAppConfigAdmin.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Enmax_autocadappconfigsService } from "../../generated";

export interface ConfigRow { id: string; key: string; value: string; valueType: number; }

export function useAppConfigRows() {
  return useQuery<ConfigRow[]>({
    queryKey: ["app-config-admin"],
    throwOnError: false,
    queryFn: async () => {
      const r = await Enmax_autocadappconfigsService.getAll({
        select: ["enmax_autocadappconfigid", "enmax_acdnkey", "enmax_acdnvalue", "enmax_acdnvaluetype"],
        orderBy: ["enmax_acdnkey asc"],
      });
      if (!r.success) throw new Error("Config fetch failed");
      return (r.data ?? []).map(x => {
        const o = x as Record<string, unknown>;
        return {
          id: o["enmax_autocadappconfigid"] as string,
          key: (o["enmax_acdnkey"] as string) ?? "",
          value: (o["enmax_acdnvalue"] as string) ?? "",
          valueType: (o["enmax_acdnvaluetype"] as number) ?? 3,
        };
      });
    },
  });
}

export function useSaveConfigRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      Enmax_autocadappconfigsService.update(id, { enmax_acdnvalue: value } as Parameters<typeof Enmax_autocadappconfigsService.update>[1]),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["app-config-admin"] });
      void qc.invalidateQueries({ queryKey: ["app-config"] }); // live app picks up changes
    },
  });
}
```

- [ ] **Step 2: Page (typed editors per value-type)**

`src/features/admin/AppConfigPage.tsx`: render each `ConfigRow` with an editor by `valueType` — `1`→`<Switch>` (value `"true"/"false"`), `2`→`<Input type="number">`, `4`→`<Textarea>` (JSON), default `3`→`<Input>`. Each row has a Save button calling `useSaveConfigRow().mutate({id, value})` with a success/error Toast. Validate before save: number rows must parse to an integer; boolean rows are toggles (always valid); JSON rows must `JSON.parse` without throwing (show inline error otherwise). Group under a `Title2 "App Configuration"`. Loading → `<Spinner>`; genuine empty → `<EmptyState title="No configuration rows" />` (Task 2); error → MessageBar. Admin-only (the route guards it).

- [ ] **Step 3: Route + nav**

`src/pages/AppConfig.tsx`: `export { AppConfigPage as default } from "../features/admin/AppConfigPage";` (match sibling page wrappers).
`routes.tsx`: add `import AppConfig from "./pages/AppConfig";` and a child route:
```tsx
      { path: "app-config", element: <RequireRole roles={["Admin"]}><AppConfig /></RequireRole> },
```
`src/app/AppShell.tsx`: add an "App Configuration" nav link under the **Administration** group (mirror the existing Reference Data / Audit admin nav items; icon e.g. `SettingsCogMultipleRegular`, route `/app-config`, shown only to Admin).

- [ ] **Step 4: Test**

`src/__tests__/admin/AppConfigPage.test.tsx`: mock `useAppConfigRows` → rows incl `{key:"GridPageSize",value:"10",valueType:2}` and `{key:"RequireCheckInApproval",value:"false",valueType:1}`; mock `useSaveConfigRow`. Assert the integer row renders a number input with value 10, the boolean row renders a switch (unchecked), and editing + Save calls the mutation with the new value.

- [ ] **Step 5: Run — expect FAIL then PASS**, then typecheck + commit

```bash
cd apps/code-app && npx tsc -b
git add src/features/admin/ src/pages/AppConfig.tsx src/routes.tsx src/app/AppShell.tsx src/__tests__/admin/AppConfigPage.test.tsx
git commit -m "feat(plan-13): App Configuration admin page (typed editors, invalidates live config)"
```

---

## Task 11: Search — fix hang + unified drawings/reservations view-all (#11)

**Files:**
- Modify: `src/features/search/SearchPage.tsx`
- Create: `src/features/search/useUnifiedSearch.ts` (reservations fetcher; reuse `fetchSearchDrawings` for drawings)
- Modify: `src/app/Header.tsx` (view-all navigation)
- Test: `src/__tests__/search/SearchPage.test.tsx` (extend)

Current: `SearchPage` renders a drawings-only `EnmaxDataGrid` with `fetchSearchDrawings`; it ignores the `?q` URL param entirely (so the header's "View all results for '<q>'" → `/search?q=…` lands but seeds nothing). The perpetual "Loading…" means the drawings query never settles.

- [ ] **Step 1: Diagnose the hang (root-cause, no guessing)**

Run the app (`npm run dev`) and open Search. Capture which promise never settles:
- Is `fetchSearchDrawings` (drawings `getAll` with empty filter) hanging or rejecting? Add a temporary `console.log`/network check.
- Is `useCompositionLookups` (compMaps) failing/suspending such that columns never build? (Columns memo depends on `compMaps`.)
- Confirm via the network tab whether the OData request returns, errors, or hangs.
Fix the identified cause. Likely candidates + fixes: an unfiltered `getAll` that errors on a bad `select`/`orderBy` (correct the request); or `useSuspenseQuery` somewhere without a Suspense boundary (wrap or switch to `useQuery`); or the grid stuck `isPending` because the query key never changes and the fetch rejects silently (ensure `throwOnError:false` surfaces an error state — Task 2 makes empty vs error correct). Document the root cause in the commit message.

- [ ] **Step 2: Seed from `?q` + write failing test**

```tsx
test("seeds search from ?q and renders results", async () => {
  // mock fetchSearchDrawings → one row matching "res"; render at /search?q=res
  renderWithProviders(<SearchPage />, { initialPath: "/search?q=res" });
  expect(await screen.findByDisplayValue("res")).toBeInTheDocument(); // search input seeded
});
```
Implement: read `const [params] = useSearchParams(); const q = params.get("q") ?? "";` and pass it as the grid's initial search. Add an `initialSearch?: string` prop to `EnmaxDataGrid` (seed `useGridState`'s initial `search`), or set it via the grid's existing URL-state if `useGridState` already reads URL params. Verify `useGridState` — if it already syncs `search` to the URL, ensure the hash `?q` maps to it; otherwise add `initialSearch`.

- [ ] **Step 3: Unified drawings + reservations**

Add a tabbed view: **Drawings** (existing grid) + **Reservations**. `useUnifiedSearch.ts` exports `fetchSearchReservations(params)` (query `enmax_autocadreservations` by `enmax_acdnreservationnumber`/reason contains `q`, returning a small reservation row + coded composition). Render a `TabList` with the drawings grid and a reservations `EnmaxDataGrid` (columns: reservation #, status, coded composition, requester, date; row click → `/reservations/:id`). Both grids seed from `?q`. Default tab = Drawings.

- [ ] **Step 4: Header view-all wiring**

In `Header.tsx`, ensure the "View all results for '<q>'" link does `navigate(\`/search?q=\${encodeURIComponent(q)}\`)` and closes the dropdown. (If it already navigates there, no change beyond confirming SearchPage now consumes `?q`.)

- [ ] **Step 5: Run — expect PASS**, then typecheck + commit

```bash
cd apps/code-app && npx tsc -b && npm test -- --run src/__tests__/search/SearchPage.test.tsx
git add src/features/search/SearchPage.tsx src/features/search/useUnifiedSearch.ts src/app/Header.tsx src/components/DataGrid/EnmaxDataGrid.tsx src/components/DataGrid/types.ts src/__tests__/search/SearchPage.test.tsx
git commit -m "feat(plan-13): fix search hang; seed from ?q; unified drawings+reservations view-all"
```

---

## Final Verification (before PR)

- [ ] `cd apps/code-app && npx tsc -b` clean
- [ ] `npm run lint` → 0 errors
- [ ] `npm test -- --run` → all green, stable across 2 consecutive runs (no flakes)
- [ ] Manual browser pass of each touched screen (My Items, Audit, Reference Data, Search, Settings, App Config, approvals flyout, drawing detail flyout)
- [ ] Open / update PR

---

## Spec Coverage Map

| Spec section | Task |
|---|---|
| 2.1 Pagination | Task 1 (+ consumed by 4,5,7,9) |
| 2.2 Empty/error | Task 2 (+ used by 7,10,11) |
| 2.3 De-dup filters | Tasks 3,4,5,7 |
| 3.1 Audit overhaul | Task 4 |
| 3.2 My Items | Task 5 |
| 3.6 Settings single-admin | Task 6 |
| 3.5 Reference Data + sort order | Task 7 |
| 3.3 Drawing detail flyout | Task 8 |
| 3.4 Approvals flyout | Task 9 |
| 4.1 App Config page | Task 10 |
| 4.2 Search | Task 11 |
| §5 Pill color map | Task 4 (auditPills) + reused Task 8 |

---

## Notes & Risks

- **Server-side audit paging** (Task 4) and `useDrawingDetail` annotations (Task 8) depend on the generated `getAll` supporting `skip`/`count`/formatted-value annotations — verify against `src/generated/services` and adapt (the spec/task notes give fallbacks). Do not reintroduce bulk fetches.
- **Search hang** (Task 11) and the **drawing-detail blank fields source** (Task 8) require brief live diagnosis — both tasks specify root-cause-first, not blind patches.
- **DrawingActionsPanel `variant="split"`** (Task 9) makes the secondary dialogs controllable; keep the default `"inline"` path byte-identical so the search detail panel + reservation details page are unaffected.
- These changes layer on PR #7's branch — decide at handoff whether to extend PR #7 or open a follow-up PR.

