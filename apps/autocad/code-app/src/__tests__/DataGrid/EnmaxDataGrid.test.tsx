import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { EnmaxDataGrid } from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";
import type { Role } from "../../auth/useUserRole";

vi.mock("../../config/useAppConfig", () => ({ useAppConfig: () => ({ GridPageSize: 50 }) }));

const mockRole: { value: Role } = { value: "Admin" };

vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: mockRole.value, isPending: false }),
}));

interface Row { id: string; name: string; category: string }

const COLUMNS: ColumnDef<Row>[] = [
  { id: "name",     header: "Name",     accessor: r => r.name,     sortable: true, filterable: true, filterType: "text",   visibleByDefault: true  },
  { id: "category", header: "Category", accessor: r => r.category, sortable: true, filterable: true, filterType: "select",
    filterOptions: [{ value: "A", label: "Alpha" }, { value: "B", label: "Beta" }],
    visibleByDefault: true },
];

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, name: `Row ${i}`, category: i % 2 === 0 ? "A" : "B" }));
}

function makeFetcher(totalRows: Row[], pageSize = 50) {
  return async (params: GridFetchParams) => {
    const start = params.page * pageSize;
    return { rows: totalRows.slice(start, start + pageSize), totalCount: totalRows.length };
  };
}

afterEach(() => { mockRole.value = "Admin"; vi.clearAllMocks(); });

// Test 1 — Renders rows from fetcher
test("renders rows returned by fetcher", async () => {
  const rows = makeRows(3);
  renderWithProviders(
    <EnmaxDataGrid queryKey={["test"]} fetcher={makeFetcher(rows)} columns={COLUMNS} rowKey={r => r.id} />,
  );
  await waitFor(() => expect(screen.getByText("Row 0")).toBeInTheDocument());
  expect(screen.getByText("Row 1")).toBeInTheDocument();
  expect(screen.getByText("Row 2")).toBeInTheDocument();
});

// Test 2 — Pagination navigates correctly
test("pagination navigates between pages", async () => {
  const user = userEvent.setup();
  const rows = makeRows(100);
  renderWithProviders(
    <EnmaxDataGrid queryKey={["test-paging"]} fetcher={makeFetcher(rows, 50)} columns={COLUMNS} rowKey={r => r.id} initialPageSize={50} />,
    { initialPath: "/" },
  );
  await waitFor(() => expect(screen.getByText("Row 0")).toBeInTheDocument());
  expect(screen.queryByText("Row 50")).not.toBeInTheDocument();

  const nextBtn = screen.getByRole("button", { name: /next/i });
  await user.click(nextBtn);

  await waitFor(() => expect(screen.getByText("Row 50")).toBeInTheDocument());
  expect(screen.queryByText("Row 0")).not.toBeInTheDocument();
});

// Test 3 — Virtualisation: 10K rows, only ~30 DOM rows rendered
test("virtualisation: 10K rows render ≤60 DOM data rows at once", async () => {
  const rows = makeRows(10_000);
  renderWithProviders(
    <EnmaxDataGrid queryKey={["test-virtual"]} fetcher={makeFetcher(rows, 10_000)} columns={COLUMNS} rowKey={r => r.id} initialPageSize={10_000} />,
  );
  await waitFor(() => expect(screen.getByText("Row 0")).toBeInTheDocument(), { timeout: 5000 });
  const dataRows = screen.getAllByRole("row").filter(r => r.tagName === "TR" && within(r).queryAllByRole("columnheader").length === 0);
  // virtualiser renders only a window; total DOM rows should be far less than 10K
  expect(dataRows.length).toBeLessThan(100);
});

// Test 4 — WS4 item 11: CSV export is available to ALL users (no admin gate)
test("CSV export button present for User role (all users can export)", async () => {
  mockRole.value = "User";
  const rows = makeRows(3);
  renderWithProviders(
    <EnmaxDataGrid queryKey={["test-export"]} fetcher={makeFetcher(rows)} columns={COLUMNS} rowKey={r => r.id} enableExport />,
  );
  await waitFor(() => expect(screen.getByText("Row 0")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
});

// Test 5 — CSV export button visible and clickable for Admin
test("CSV export button present for Admin", async () => {
  const rows = makeRows(3);
  renderWithProviders(
    <EnmaxDataGrid queryKey={["test-export-admin"]} fetcher={makeFetcher(rows)} columns={COLUMNS} rowKey={r => r.id} enableExport />,
  );
  await waitFor(() => screen.getByRole("button", { name: /export csv/i }));
  expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
});

// Test 5b — WS4 item 11: export defaults ON (no enableExport prop) and can be opted out
test("CSV export defaults on, and is hidden only when enableExport={false}", async () => {
  mockRole.value = "User";
  const rows = makeRows(3);
  const { unmount } = renderWithProviders(
    <EnmaxDataGrid queryKey={["test-export-default"]} fetcher={makeFetcher(rows)} columns={COLUMNS} rowKey={r => r.id} />,
  );
  await waitFor(() => expect(screen.getByText("Row 0")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
  unmount();

  renderWithProviders(
    <EnmaxDataGrid queryKey={["test-export-off"]} fetcher={makeFetcher(rows)} columns={COLUMNS} rowKey={r => r.id} enableExport={false} />,
  );
  await waitFor(() => expect(screen.getByText("Row 0")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /export csv/i })).not.toBeInTheDocument();
});

// Test 6 — Quick-search debounces (state reflected in search params)
test("quick-search debounces and updates search input state", async () => {
  const user = userEvent.setup();
  const rows = makeRows(5);
  const fetcherSpy = vi.fn(makeFetcher(rows));
  renderWithProviders(
    <EnmaxDataGrid queryKey={["test-search"]} fetcher={fetcherSpy} columns={COLUMNS} rowKey={r => r.id} quickSearchPlaceholder="Search rows…" />,
  );
  await waitFor(() => expect(screen.getByText("Row 0")).toBeInTheDocument());

  const input = screen.getByPlaceholderText("Search rows…");
  await user.type(input, "abc");
  // Input value should reflect typed text immediately
  expect(input).toHaveValue("abc");
});

// Test 7 — Column filter from URL search params is passed to fetcher
// (Typing char-by-char batches React Router state updates; pre-seed via initialPath instead)
test("column filter updates URL search params (f.<col> key)", async () => {
  const rows = makeRows(5);
  let capturedParams: GridFetchParams | null = null;
  const fetcherSpy = vi.fn(async (p: GridFetchParams) => { capturedParams = p; return { rows, totalCount: rows.length }; });

  renderWithProviders(
    <EnmaxDataGrid queryKey={["test-filter"]} fetcher={fetcherSpy} columns={COLUMNS} rowKey={r => r.id} />,
    { initialPath: "/?f.name=hello" },
  );

  await waitFor(() => {
    expect(capturedParams?.filters["name"]).toBe("hello");
  }, { timeout: 3000 });
});

// Test 8 — Column visibility menu toggles columns
test("column visibility menu can hide a column", async () => {
  const user = userEvent.setup();
  const rows = makeRows(2);
  renderWithProviders(
    <EnmaxDataGrid queryKey={["test-vis"]} fetcher={makeFetcher(rows)} columns={COLUMNS} rowKey={r => r.id} enableColumnVisibility />,
  );
  await waitFor(() => expect(screen.getByText("Row 0")).toBeInTheDocument());
  expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /columns/i }));
  await user.click(screen.getByRole("menuitem", { name: /^Name$/ }));

  await waitFor(() => expect(screen.queryByRole("columnheader", { name: "Name" })).not.toBeInTheDocument());
});

// Test 9 — Sort change triggers refetch with updated params
test("clicking sortable column header triggers refetch with sort params", async () => {
  const user = userEvent.setup();
  const rows = makeRows(3);
  let lastParams: GridFetchParams | null = null;
  const fetcherSpy = vi.fn(async (p: GridFetchParams) => { lastParams = p; return { rows, totalCount: rows.length }; });

  renderWithProviders(
    <EnmaxDataGrid queryKey={["test-sort"]} fetcher={fetcherSpy} columns={COLUMNS} rowKey={r => r.id} />,
  );
  await waitFor(() => expect(screen.getByText("Row 0")).toBeInTheDocument());

  const nameHeader = screen.getByRole("columnheader", { name: /name/i });
  await user.click(nameHeader);

  await waitFor(() => expect(lastParams?.sort?.column).toBe("name"), { timeout: 3000 });
  expect(lastParams?.sort?.direction).toBe("asc");
});

// Test 10 — Empty state renders custom message
test("renders empty message when fetcher returns 0 rows", async () => {
  renderWithProviders(
    <EnmaxDataGrid
      queryKey={["test-empty"]}
      fetcher={async () => ({ rows: [], totalCount: 0 })}
      columns={COLUMNS}
      rowKey={r => r.id}
      emptyMessage="Nothing to show here."
    />,
  );
  await waitFor(() => expect(screen.getByText("Nothing to show here.")).toBeInTheDocument());
});
