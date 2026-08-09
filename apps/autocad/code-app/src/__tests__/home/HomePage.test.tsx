import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { HomePage } from "../../features/home/HomePage";
import type { Role } from "../../auth/useUserRole";

const CURRENT = { id: "00000000-0000-0000-0000-000000000001", displayName: "Rahul Akmol" };

const roleRef: { value: Role } = { value: "User" };
type Rows = Array<Record<string, unknown>>;
const checkoutsRef: { value: Rows } = { value: [] };
const reservationsRef: { value: Rows } = { value: [] };
const pendingResRef: { value: Rows } = { value: [] };
const pendingChkRef: { value: number } = { value: 0 };
const broadcastsRef: { value: Rows } = { value: [] };
const healthRef: { value: Rows } = { value: [] };

vi.mock("../../auth/useCurrentUser", () => ({ useCurrentUser: () => ({ data: CURRENT, isPending: false }) }));
vi.mock("../../auth/useUserRole", () => ({ useUserRole: () => ({ role: roleRef.value, isPending: false }) }));
vi.mock("../../features/approvals/hooks/usePendingReservations", () => ({
  usePendingReservations: () => ({ data: pendingResRef.value }),
}));
vi.mock("../../features/home/useHomeData", () => ({
  useMyOpenCheckouts: () => ({ data: checkoutsRef.value, isPending: false }),
  useMyRecentReservations: () => ({ data: reservationsRef.value, isPending: false }),
  usePendingCheckinCount: () => ({ data: pendingChkRef.value }),
  useHomeBroadcasts: () => ({ data: broadcastsRef.value }),
  useSequenceHealth: () => ({ data: healthRef.value, isPending: false }),
}));
const emptyMaps = () => ({
  bizMap: new Map<string, string>(),
  assetMap: new Map<string, string>(),
  unitMap: new Map<string, string>(),
  domainMap: new Map<string, string>(),
  sysMap: new Map<string, string>(),
  kindMap: new Map<string, string>(),
});
const compositionMapsRef: { value: ReturnType<typeof emptyMaps> } = { value: emptyMaps() };

vi.mock("../../features/approvals/hooks/useCompositionLookups", () => ({
  useCompositionLookups: () => ({ data: compositionMapsRef.value }),
}));

afterEach(() => {
  roleRef.value = "User";
  checkoutsRef.value = [];
  reservationsRef.value = [];
  pendingResRef.value = [];
  pendingChkRef.value = 0;
  broadcastsRef.value = [];
  healthRef.value = [];
  compositionMapsRef.value = emptyMaps();
});

test("greets the user by full name", () => {
  renderWithProviders(<HomePage />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Rahul Akmol/);
});

test("a User with nothing open sees 'all caught up' and no admin health card", () => {
  renderWithProviders(<HomePage />);
  expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  expect(screen.queryByText(/number sequence health/i)).not.toBeInTheDocument();
});

test("status line summarizes open work", () => {
  checkoutsRef.value = [{ checkoutId: "c1", drawingNumber: "0042", status: 1, daysOut: 3, checkedOutOn: new Date().toISOString() }];
  reservationsRef.value = [{ id: "r1", reservationNumber: "RES-1", status: 1, createdOn: new Date().toISOString() }];
  renderWithProviders(<HomePage />);
  expect(screen.getByText(/1 open Check Out.*1 pending reservation/i)).toBeInTheDocument();
});

test("checkout card uses Drawings/Documents title", () => {
  checkoutsRef.value = [{
    checkoutId: "c1",
    drawingNumber: "DE-9A-10-AES-AAA-DS-0001",
    typeLabel: "Drawing",
    checkedOutByName: "Alex",
    status: 1,
    daysOut: 1,
    checkedOutOn: new Date().toISOString(),
  }];
  renderWithProviders(<HomePage />);
  expect(screen.getByText(/My Checked out Drawings\/Documents/i)).toBeInTheDocument();
  expect(screen.getByText("DE-9A-10-AES-AAA-DS-0001")).toBeInTheDocument();
  expect(screen.getByText("Drawing")).toBeInTheDocument();
  expect(screen.getByText(/Checked out for Alex/i)).toBeInTheDocument();
});

test("reservation card shows coding sequence, type, and reserved for — never RES-XXX", () => {
  compositionMapsRef.value = {
    bizMap: new Map([["biz-1", "DE"]]),
    assetMap: new Map([["asset-1", "9A"]]),
    unitMap: new Map([["unit-1", "10"]]),
    domainMap: new Map([["dom-1", "AES"]]),
    sysMap: new Map([["sys-1", "AAA"]]),
    kindMap: new Map([["kind-1", "DS"]]),
  };
  reservationsRef.value = [{
    id: "r1",
    reservationNumber: "RES-1184",
    status: 2,
    createdOn: new Date().toISOString(),
    typeLabel: "Drawing",
    submitterDisplay: "Jordan",
    businessId: "biz-1",
    assetId: "asset-1",
    unitId: "unit-1",
    domainId: "dom-1",
    systemId: "sys-1",
    kindId: "kind-1",
    issuedNumbers: "[1,2,3]",
  }];
  renderWithProviders(<HomePage />);
  expect(screen.getByText("DE-9A-10-AES-AAA-DS-0001 To 0003")).toBeInTheDocument();
  expect(screen.getByText("Drawing")).toBeInTheDocument();
  expect(screen.getByText(/Reserved for Jordan/i)).toBeInTheDocument();
  expect(screen.queryByText("RES-1184")).not.toBeInTheDocument();
});

test("Approver sees pending-approval attention with a Review action", () => {
  roleRef.value = "Approver";
  pendingResRef.value = [{}, {}, {}];
  renderWithProviders(<HomePage />);
  expect(screen.getByText(/3 reservations pending your approval/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /review/i })).toBeInTheDocument();
});

test("a stale check-out surfaces in the attention panel", () => {
  checkoutsRef.value = [{ checkoutId: "c1", drawingNumber: "GG-CG-00-0042", status: 1, daysOut: 120, checkedOutOn: "2026-01-01T00:00:00Z" }];
  renderWithProviders(<HomePage />);
  expect(screen.getByText(/stale Check Out/i)).toBeInTheDocument();
});

test("Admin sees the number sequence health card", () => {
  roleRef.value = "Admin";
  healthRef.value = [{ key: "GG-CG-00-ECS-AST-DD", lastIssued: 9905, status: 3 }];
  renderWithProviders(<HomePage />);
  expect(screen.getByText(/number sequence health/i)).toBeInTheDocument();
  expect(screen.getByText("GG-CG-00-ECS-AST-DD")).toBeInTheDocument();
});
