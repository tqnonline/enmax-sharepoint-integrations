import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { MyItemsPage } from "../../features/myitems/MyItemsPage";
import type { MyRecordRow } from "../../features/myitems/useMyRecords";

vi.mock("../../auth/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: { id: "test-user-001", name: "Test User" }, isPending: false }),
}));

vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: "User", isPending: false }),
}));

const mockAppConfig = vi.hoisted(() => ({
  GridPageSize: 10,
  GridDefaultFromDays: 30,
  RequireCheckInApproval: false,
  AdminTeamId: undefined as string | undefined,
  UserTeamId: undefined as string | undefined,
  ApproverTeamId: undefined as string | undefined,
  EnableDrawingCheckout: true,
  EnableDrawingDocumentCheckout: true,
  EnableStandardCheckout: true,
  EnableProcedureCheckout: true,
  EnableFormCheckout: true,
}));

vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => mockAppConfig,
}));

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

const PENDING_RESERVATION: MyRecordRow = {
  id: "res-001",
  number: "RES-00001",
  title: "Need numbers for project",
  typeLabel: "Drawing",
  statusLabel: "Pending",
  state: 1,
  createdOn: "2026-05-01T10:00:00Z",
  approvedOn: "",
  checkedOutOn: "",
  checkedInOn: "",
  revisionDate: "",
  libraryUrl: "",
  destinationUrl: "",
  source: "reservation",
  reservationNumber: "RES-00001",
  issuedNumbers: "",
  businessId: "biz-1",
  assetId: "ast-1",
  unitId: "unit-1",
  domainId: "dom-1",
  systemId: "sys-1",
  kindId: "kind-1",
  businessDisplay: "GG",
  assetDisplay: "CG",
  unitDisplay: "00",
  domainDisplay: "ECS",
  systemDisplay: "AST",
  kindDisplay: "DD",
  submittedById: "",
  submittedByName: "",
  approvedById: "",
  approvedByName: "",
};

const APPROVED_COMPOSITION: MyRecordRow = {
  ...PENDING_RESERVATION,
  id: "res-003",
  number: "RES-00003",
  title: "Approved batch for units 1-3",
  issuedNumbers: "[1,2,3]",
};

const CHECKED_OUT_RECORD: MyRecordRow = {
  id: "drw-001",
  drawingId: "drawing-001",
  number: "GG-CG-00-ECS-AST-DD-0001",
  baseNumber: "GG-CG-00-ECS-AST-DD-0001",
  sheetNumber: 1,
  title: "Schematic A",
  typeLabel: "Standard",
  statusLabel: "Checked Out",
  state: 2,
  createdOn: "",
  approvedOn: "",
  submittedById: "",
  submittedByName: "",
  approvedById: "",
  approvedByName: "",
  checkedOutOn: "",
  checkedInOn: "",
  revisionDate: "2026-04-01T00:00:00Z",
  libraryUrl: "https://sharepoint.example.com/drw1",
  destinationUrl: "https://sharepoint.example.com/dest1",
  source: "record",
  businessDisplay: "GG",
  assetDisplay: "CG",
  unitDisplay: "00",
  domainDisplay: "ECS",
  systemDisplay: "AST",
  kindDisplay: "DD",
  enmax_acdnreservationtype: 2,
  enmax_acdndocumentsubtype: 3,
};

vi.mock("../../features/myitems/useMyRecords", async () => {
  const actual = await vi.importActual<typeof import("../../features/myitems/useMyRecords")>(
    "../../features/myitems/useMyRecords",
  );
  return {
    ...actual,
    fetchMyRecordCounts: async () => ({
      reservations: { value: 2, capped: false },
      available:    { value: 0, capped: false },
      checkedout:   { value: 1, capped: false },
    }),
    fetchMyRecordRows: async (
      _userId: string,
      _typeFilter: string,
      stateFilter: string,
    ) => {
      if (stateFilter === "reservations") {
        return { rows: [PENDING_RESERVATION, APPROVED_COMPOSITION], totalCount: 2 };
      }
      if (stateFilter === "checkedout") {
        return { rows: [CHECKED_OUT_RECORD], totalCount: 1 };
      }
      return { rows: [], totalCount: 0 };
    },
  };
});

afterEach(() => {
  vi.clearAllMocks();
  mockAppConfig.EnableDrawingCheckout = true;
  mockAppConfig.EnableDrawingDocumentCheckout = true;
  mockAppConfig.EnableStandardCheckout = true;
  mockAppConfig.EnableProcedureCheckout = true;
  mockAppConfig.EnableFormCheckout = true;
});

test("shows primary type tabs Drawings and merged documents tab", () => {
  renderWithProviders(<MyItemsPage />);
  expect(screen.getByRole("tab", { name: "Drawings" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /Standards, Procedures & Forms/i })).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: /^Standards$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: /^Procedure Forms$/i })).not.toBeInTheDocument();
});

test("shows top-level Query and Clear filter controls on every state tab", async () => {
  const user = userEvent.setup();
  renderWithProviders(<MyItemsPage />);
  expect(screen.getByRole("button", { name: "Query" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: /Checked Out/i }));
  expect(screen.getByRole("button", { name: "Query" })).toBeInTheDocument();
  expect(screen.getByLabelText("From date")).toBeInTheDocument();
});

test("shows secondary state tabs My Reservations, Available, Checked Out", () => {
  renderWithProviders(<MyItemsPage />);
  expect(screen.getByRole("tab", { name: /My Reservations/i })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /Available/i })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /Checked Out/i })).toBeInTheDocument();
});

test("My Reservations tab shows Reason column for submitted reservations", async () => {
  renderWithProviders(<MyItemsPage />);
  await waitFor(() => expect(screen.getByRole("columnheader", { name: "Reason" })).toBeInTheDocument());
  expect(screen.getByText("Need numbers for project")).toBeInTheDocument();
  expect(screen.getByText("GG-CG-00-ECS-AST-DD-????")).toBeInTheDocument();
  expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  // Always the logged-in user — no person filter; number filter is Drawing/Document Number.
  expect(screen.getByLabelText("Drawing/Document Number")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Drawing/Document Number" })).toBeInTheDocument();
  expect(screen.queryByText("Submitted or approved by")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Reservation #")).not.toBeInTheDocument();
});

test("composition column shows resolved codes and issued-number range", async () => {
  renderWithProviders(<MyItemsPage />);
  await waitFor(() => expect(screen.getByText("GG-CG-00-ECS-AST-DD-0001 To 0003")).toBeInTheDocument());
  expect(screen.getByText("GG-CG-00-ECS-AST-DD-????")).toBeInTheDocument();
});

test("Checked Out tab shows record data", async () => {
  const user = userEvent.setup();
  renderWithProviders(<MyItemsPage />);
  await user.click(screen.getByRole("tab", { name: /Checked Out/i }));
  await waitFor(() => expect(screen.getByText("GG-CG-00-ECS-AST-DD-0001")).toBeInTheDocument());
  expect(screen.getByRole("link", { name: /Open in SharePoint/i })).toBeInTheDocument();
  expect(screen.getByText("Standard")).toBeInTheDocument();
});

test("grid has no Actions column header", async () => {
  renderWithProviders(<MyItemsPage />);
  await waitFor(() => expect(screen.getByText("GG-CG-00-ECS-AST-DD-????")).toBeInTheDocument());
  expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
});

test("hides Checked Out and Pending Approval when Standard/Procedure/Form checkout are all off", async () => {
  const user = userEvent.setup();
  mockAppConfig.EnableStandardCheckout = false;
  mockAppConfig.EnableProcedureCheckout = false;
  mockAppConfig.EnableFormCheckout = false;
  mockAppConfig.EnableDrawingCheckout = true;
  mockAppConfig.EnableDrawingDocumentCheckout = true;

  renderWithProviders(<MyItemsPage />);
  // Drawings tab still shows checkout states.
  expect(screen.getByRole("tab", { name: /Checked Out/i })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /Pending Approval/i })).toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: /Standards, Procedures & Forms/i }));
  expect(screen.queryByRole("tab", { name: /Checked Out/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: /Pending Approval/i })).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /My Reservations/i })).toBeInTheDocument();

  mockAppConfig.EnableStandardCheckout = true;
  mockAppConfig.EnableProcedureCheckout = true;
  mockAppConfig.EnableFormCheckout = true;
});

test("state tabs show a single count badge per state (no duplicate stat strip)", async () => {
  renderWithProviders(<MyItemsPage />);
  // Counts now live only on the tabs: reservations=2, checkedout=1, available=0 (hidden).
  await waitFor(() => {
    expect(screen.getByRole("tab", { name: /My Reservations.*2/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Checked Out.*1/i })).toBeInTheDocument();
  });
  // Available has 0 → no badge digit on that tab.
  expect(screen.getByRole("tab", { name: /^Available$/i })).toBeInTheDocument();
});
