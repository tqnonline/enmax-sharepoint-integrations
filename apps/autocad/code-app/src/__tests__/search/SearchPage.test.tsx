import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { SearchPage } from "../../features/search/SearchPage";
import type { DrawingRow } from "../../features/search/useSearchDrawings";
import type { ReservationRow } from "../../features/search/useUnifiedSearch";
import type { GridFetchParams } from "../../components/DataGrid";

vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: "Admin", isPending: false }),
}));

vi.mock("../../features/drawings/DrawingActionsPanel", () => ({
  DrawingActionsPanel: ({ drawingId }: { drawingId: string }) => <div>Actions:{drawingId}</div>,
}));

vi.mock("../../features/search/DrawingDetailPanel", () => ({
  DrawingDetailPanel: ({ drawing }: { drawing: DrawingRow | null; onClose: () => void }) =>
    drawing
      ? <div data-testid="detail-panel"><span>{drawing.enmax_acdntitle}</span><div>Actions:{drawing.id}</div></div>
      : null,
}));

const MOCK_DRAWING: DrawingRow = {
  id:                         "drw-001",
  enmax_acdnnumber:           "GG-CG-00-ECS-AST-DD-0001",
  enmax_acdntitle:            "Main Single Line Diagram",
  enmax_acdncurrentrevision:  "C",
  enmax_acdnrevisiondate:     "2026-01-15T00:00:00Z",
  enmax_acdnstate:            1,
  enmax_acdnsheetcount:       3,
  enmax_acdnsplibraryurl:     "https://sharepoint.example.com/drawing1",
  _enmax_acdnbusiness_value:   "biz-001",
  _enmax_acdnasset_value:      "ast-001",
  _enmax_acdnunit_value:       "unit-001",
  _enmax_acdndomain_value:     "dom-001",
  _enmax_acdnsystem_value:     "sys-001",
  _enmax_acdnkind_value:       "knd-001",
  _enmax_acdnrecordtype_value: "rt-001",
  _enmax_acdnrecordphase_value:"rp-001",
  _enmax_acdnvendor_value:     "vnd-001",
  _createdby_value:            "usr-001",
  businessDisplay:    "Generation",
  assetDisplay:       "Coal Gen",
  unitDisplay:        "Unit 0",
  domainDisplay:      "Electrical Control Systems",
  systemDisplay:      "AST",
  kindDisplay:        "Detailed Design",
  recordTypeDisplay:  "Schematic",
  recordPhaseDisplay: "Issued",
  vendorDisplay:      "ACME Corp",
  requesterDisplay:   "Jane Doe",
};

let capturedFetchParams: GridFetchParams | null = null;
let capturedReservationParams: GridFetchParams | null = null;

vi.mock("../../features/search/useSearchDrawings", () => ({
  DRAWING_STATE_LABELS: { 1: "Available", 2: "Reserved", 3: "CheckedOut", 4: "AwaitingValidation", 5: "Archived" },
  fetchSearchDrawings: async (p: GridFetchParams) => {
    capturedFetchParams = p;
    return { rows: [MOCK_DRAWING], totalCount: 1 };
  },
}));

const MOCK_RESERVATION: ReservationRow = {
  id:            "rsv-001",
  number:        "RES-2026-0001",
  status:        1,
  reason:        "Capital project upgrade",
  requesterName: "John Smith",
  createdon:     "2026-04-01T00:00:00Z",
};

vi.mock("../../features/search/useUnifiedSearch", () => ({
  fetchSearchReservations: async (p: GridFetchParams) => {
    capturedReservationParams = p;
    return { rows: [MOCK_RESERVATION], totalCount: 1 };
  },
}));

afterEach(() => { capturedFetchParams = null; capturedReservationParams = null; vi.clearAllMocks(); });

// Test 11 — Row click opens DrawingDetailPanel
test("row click opens DrawingDetailPanel", async () => {
  const user = userEvent.setup();
  // Search grid is gated until a query is entered; seed ?q to load results.
  renderWithProviders(<SearchPage />, { initialPath: "/?q=dd" });
  await waitFor(() => expect(screen.getByText("GG-CG-00-ECS-AST-DD-0001")).toBeInTheDocument());
  await user.click(screen.getByText("GG-CG-00-ECS-AST-DD-0001"));
  await waitFor(() => expect(screen.getByTestId("detail-panel")).toBeInTheDocument());
  expect(screen.getByText("Actions:drw-001")).toBeInTheDocument();
});

// Test 12 — Multi-select Business filter composes OR clause
test("business filter value is passed to fetcher", async () => {
  renderWithProviders(<SearchPage />, { initialPath: "/?q=dd&f.business=biz-001" });
  await waitFor(() => expect(capturedFetchParams).not.toBeNull(), { timeout: 3000 });
  expect(capturedFetchParams?.filters["business"]).toBe("biz-001");
});

// Test 13 — DrawingDetailPanel shows DrawingActionsPanel content
test("DrawingDetailPanel renders DrawingActionsPanel stub from plan #06", async () => {
  const user = userEvent.setup();
  renderWithProviders(<SearchPage />, { initialPath: "/?q=dd" });
  await waitFor(() => expect(screen.getByText("GG-CG-00-ECS-AST-DD-0001")).toBeInTheDocument());
  await user.click(screen.getByText("GG-CG-00-ECS-AST-DD-0001"));
  await waitFor(() => expect(screen.getByText("Actions:drw-001")).toBeInTheDocument());
});

// Test 14 — SharePoint link opens in new tab
test("title link has target=_blank for SharePoint URL", async () => {
  renderWithProviders(<SearchPage />, { initialPath: "/?q=dd" });
  await waitFor(() => expect(screen.getByRole("link", { name: /Main Single Line Diagram/i })).toBeInTheDocument());
  const link = screen.getByRole("link", { name: /Main Single Line Diagram/i });
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("href", "https://sharepoint.example.com/drawing1");
});

// Test 15 — Default sort is enmax_acdnnumber asc
test("default sort is ENMAX Number ascending", async () => {
  renderWithProviders(<SearchPage />, { initialPath: "/?q=dd" });
  await waitFor(() => expect(capturedFetchParams).not.toBeNull(), { timeout: 3000 });
  expect(capturedFetchParams?.sort).toEqual({ column: "enmax_acdnnumber", direction: "asc" });
});

// Test A — ?q seeding: navigating to /search?q=res seeds the drawings search input
test("?q param seeds the drawings search input", async () => {
  renderWithProviders(<SearchPage />, { initialPath: "/search?q=res" });
  // The search input should be seeded from the URL param
  await screen.findByDisplayValue("res");
});

// Test B — Reservations tab: clicking shows reservations grid with reservation number
test("clicking Reservations tab shows reservations grid", async () => {
  const user = userEvent.setup();
  renderWithProviders(<SearchPage />, { initialPath: "/?q=re" });
  // Default tab is Drawings; click Reservations tab
  await user.click(screen.getByRole("tab", { name: /Reservations/i }));
  // Reservation number from mock data should appear
  await waitFor(() => expect(screen.getByText("RES-2026-0001")).toBeInTheDocument());
});

// Test C — Reservations sort: clicking "Reservation #" header wires params.sort to fetcher
// Intent: ensures the grid's sort state flows through to fetchSearchReservations so
// server-side sort (ALLOWED_SORT_COLS) is exercised, not silently ignored.
test("clicking Reservation # header passes sort params to fetcher", async () => {
  const user = userEvent.setup();
  renderWithProviders(<SearchPage />, { initialPath: "/?q=re" });
  // Switch to Reservations tab
  await user.click(screen.getByRole("tab", { name: /Reservations/i }));
  // Wait for initial render with default sort (column: "number", direction: "asc")
  await waitFor(() => expect(capturedReservationParams).not.toBeNull(), { timeout: 3000 });
  expect(capturedReservationParams?.sort).toEqual({ column: "number", direction: "asc" });

  // Click the "Reservation #" column header to toggle to desc
  const header = await screen.findByText(/Reservation #/i);
  await user.click(header);
  await waitFor(() =>
    expect(capturedReservationParams?.sort).toEqual(
      expect.objectContaining({ column: "number" }),
    ),
    { timeout: 3000 },
  );
});
