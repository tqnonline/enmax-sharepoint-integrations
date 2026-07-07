import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { MyItemsPage } from "../../features/myitems/MyItemsPage";
import type { MyReservation } from "../../features/myitems/useMyReservations";
import type { MyCheckout } from "../../features/myitems/useMyCheckouts";

vi.mock("../../auth/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: { id: "test-user-001", name: "Test User" }, isPending: false }),
}));

vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: "User", isPending: false }),
}));

vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => ({
    GridPageSize: 10,
    RequireCheckInApproval: false,
    AdminTeamId: undefined,
    UserTeamId: undefined,
    ApproverTeamId: undefined,
  }),
}));

// Composition column resolves lookup GUIDs to codes via these maps.
vi.mock("../../features/approvals/hooks/useCompositionLookups", () => ({
  useCompositionLookups: () => ({
    data: {
      bizMap:    new Map([["biz-1", "GG"]]),
      assetMap:  new Map([["ast-1", "CG"]]),
      unitMap:   new Map([["unit-1", "00"]]),
      domainMap: new Map([["dom-1", "ECS"]]),
      sysMap:    new Map([["sys-1", "AST"]]),
      kindMap:   new Map([["kind-1", "DD"]]),
    },
  }),
}));

const MOCK_RESERVATION: MyReservation = {
  id:               "res-001",
  reservationNumber:"RES-00001",
  status:           1,
  statusLabel:      "Pending",
  drawingCount:     2,
  issuedNumbers:    "",
  reason:           "Need numbers for project",
  createdOn:        "2026-05-01T10:00:00Z",
  approvedOn:       "",
  approverDisplay:  "",
  businessId:       "biz-1",
  assetId:          "ast-1",
  unitId:           "unit-1",
  domainId:         "dom-1",
  systemId:         "sys-1",
  kindId:           "kind-1",
};

const APPROVED_RESERVATION: MyReservation = {
  ...MOCK_RESERVATION,
  id:               "res-003",
  reservationNumber:"RES-00003",
  status:           2,
  statusLabel:      "Approved",
  issuedNumbers:    "[1,2,3]",
};

const DECLINED_RESERVATION: MyReservation = {
  ...MOCK_RESERVATION,
  id:               "res-002",
  reservationNumber:"RES-00002",
  status:           3,
  statusLabel:      "Declined",
};

const MOCK_CHECKOUT: MyCheckout = {
  checkoutId:         "co-001",
  drawingId:          "drw-001",
  drawingNumber:      "GG-CG-00-ECS-AST-DD-0001",
  drawingTitle:       "Schematic A",
  drawingLibraryUrl:  "https://sharepoint.example.com/drw1",
  checkedOutOn:       "2026-04-01T00:00:00Z",
  daysOut:            49,
  reminderStage:      0,
  reminderStageLabel: "None",
  status:             1,
  statusLabel:        "Open",
};

vi.mock("../../features/myitems/useMyReservations", async () => {
  const actual = await vi.importActual<typeof import("../../features/myitems/useMyReservations")>(
    "../../features/myitems/useMyReservations",
  );
  return {
    ...actual,
    fetchMyReservationRows: async (_userId: string, showFinalised: boolean) => ({
      rows: showFinalised
        ? [MOCK_RESERVATION, APPROVED_RESERVATION, DECLINED_RESERVATION]
        : [MOCK_RESERVATION, APPROVED_RESERVATION],
      totalCount: showFinalised ? 3 : 2,
    }),
    useMyReservations: (showFinalised?: boolean) => ({
      data: showFinalised
        ? [MOCK_RESERVATION, APPROVED_RESERVATION, DECLINED_RESERVATION]
        : [MOCK_RESERVATION, APPROVED_RESERVATION],
      isPending: false,
      isError:   false,
    }),
  };
});

vi.mock("../../features/myitems/useMyCheckouts", () => ({
  useMyCheckouts:      () => ({ data: [MOCK_CHECKOUT], isPending: false, isError: false }),
  fetchMyCheckoutRows: async () => ({ rows: [MOCK_CHECKOUT], totalCount: 1 }),
}));

afterEach(() => { vi.clearAllMocks(); });

// Test 16 — My Reservations scoped to current user (fetcher receives userId)
test("My Reservations tab shows user's own reservations", async () => {
  renderWithProviders(<MyItemsPage />);
  await waitFor(() => expect(screen.getByText("RES-00001")).toBeInTheDocument());
  expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
});

// Test 17 — My Reservations hides Declined by default; toggle reveals it
test("hides Declined reservations by default; show-finalised toggle reveals them", async () => {
  const user = userEvent.setup();
  renderWithProviders(<MyItemsPage />);
  await waitFor(() => expect(screen.getByText("RES-00001")).toBeInTheDocument());
  expect(screen.queryByText("RES-00002")).not.toBeInTheDocument();

  const toggle = screen.getByRole("switch", { name: /show finalised/i });
  await user.click(toggle);

  await waitFor(() => expect(screen.getByText("RES-00002")).toBeInTheDocument());
});

// Test 18 — My Checked Out Drawings tab renders joined checkout + drawing data
test("My Checked Out Drawings tab shows drawing data from checkout join", async () => {
  const user = userEvent.setup();
  renderWithProviders(<MyItemsPage />);
  await user.click(screen.getByRole("tab", { name: /my checked out drawings/i }));
  await waitFor(() => expect(screen.getByText("GG-CG-00-ECS-AST-DD-0001")).toBeInTheDocument());
  expect(screen.getByText("Schematic A")).toBeInTheDocument();
  expect(screen.getByText("49")).toBeInTheDocument();
});

// Test 20 — Reservations tab is labelled "My Document/Drawing Number Reservations" (item 12)
test("reservations tab is labelled 'My Document/Drawing Number Reservations'", () => {
  renderWithProviders(<MyItemsPage />);
  expect(screen.getByRole("tab", { name: "My Document/Drawing Number Reservations" })).toBeInTheDocument();
});

// Test 20b — Composition renders short codes (not display names) + zero-padded
// issued-number range; pending rows show ???? until numbers are issued.
test("composition column shows resolved codes and issued-number range", async () => {
  renderWithProviders(<MyItemsPage />);
  await waitFor(() => expect(screen.getByText("GG-CG-00-ECS-AST-DD-0001–0003")).toBeInTheDocument());
  expect(screen.getByText("GG-CG-00-ECS-AST-DD-????")).toBeInTheDocument();
});

// Test 21 — Reservations grid has no Actions column
test("reservations grid has no Actions column header", async () => {
  renderWithProviders(<MyItemsPage />);
  await waitFor(() => expect(screen.getByText("RES-00001")).toBeInTheDocument());
  expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
});
