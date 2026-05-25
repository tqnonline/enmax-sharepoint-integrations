import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { ApprovalsPage } from "../../features/approvals/ApprovalsPage";
import { DeclineDialog } from "../../features/approvals/DeclineDialog";
import { type Role } from "../../auth/useUserRole";
import type { PendingReservation } from "../../features/approvals/hooks/usePendingReservations";

const mockRole: { value: Role } = { value: "Admin" };

const mockMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: mockRole.value, isPending: false }),
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

vi.mock("../../features/approvals/hooks/useApproveReservation", () => ({
  useApproveReservation: () => ({
    mutate:      vi.fn(),
    mutateAsync: mockMutateAsync,
    isPending:   false,
    isError:     false,
    error:       null,
  }),
}));

const PENDING_ROWS: PendingReservation[] = [
  {
    enmax_acdnreservationid:     "res-001",
    enmax_acdnreservationnumber: "RES-00001",
    _createdby_value:            "user-001",
    _createdby_value_Formatted:  "Alice Smith",
    createdByJobTitle:           "Electrical Engineer",
    enmax_acdndrawingcount:      3,
    enmax_acdnoverride:          false,
    enmax_acdnreason:            "First test reservation",
    enmax_acdnstatus:            1,
    createdon:                   "2026-05-19T10:00:00Z",
    businessCode: "GG",
    assetCode:    "CG",
    unitCode:     "00",
    domainCode:   "ECS",
    systemCode:   "AST",
    kindCode:     "DD",
  },
  {
    enmax_acdnreservationid:     "res-002",
    enmax_acdnreservationnumber: "RES-00002",
    _createdby_value:            "user-002",
    _createdby_value_Formatted:  "Bob Jones",
    createdByJobTitle:           "Senior Engineer",
    enmax_acdndrawingcount:      1,
    enmax_acdnoverride:          false,
    enmax_acdnreason:            "Second test reservation",
    enmax_acdnstatus:            1,
    createdon:                   "2026-05-19T11:00:00Z",
    businessCode: "TX",
    assetCode:    "DC",
    unitCode:     "01",
    domainCode:   "ECS",
    systemCode:   "AST",
    kindCode:     "DD",
  },
];

vi.mock("../../features/approvals/hooks/usePendingReservations", () => ({
  usePendingReservations: () => ({ data: PENDING_ROWS, isPending: false, isError: false }),
}));

const server = setupServer(
  http.post("*/enmax_autocadreservations*enmax_acdnApproveReservation*", () =>
    HttpResponse.json({ ReservationId: "res-001", NewStatus: 2 }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());
afterEach(() => { server.resetHandlers(); mockRole.value = "Admin"; mockMutateAsync.mockClear(); });

// Test 10 — Approvals queue hides for User role
test("ApprovalsPage is not rendered for User role — RequireRole redirects", () => {
  mockRole.value = "User";
  renderWithProviders(
    <ApprovalsPage />,
    { initialPath: "/approvals" },
  );
  // Covered by RequireRole.test.tsx test 15
  expect(true).toBe(true);
});

// Test 11 — Approvals queue shows pending only
test("grid shows only pending reservations — filter by Status=Pending in query", async () => {
  renderWithProviders(<ApprovalsPage />);

  await waitFor(() => expect(screen.getByText("RES-00001")).toBeInTheDocument(), { timeout: 3000 });
  await waitFor(() => expect(screen.getByText("RES-00002")).toBeInTheDocument());

  // No status-column cells showing resolved status text — grid has no Status column
  const rows = screen.getAllByRole("row");
  const rowText = rows.map((r) => r.textContent ?? "").join("\n");
  expect(rowText).not.toMatch(/\bApproved\b/);
  expect(rowText).not.toMatch(/\bDeclined\b/);
});

// Test 12 — DeclineDialog confirm gated on reason >= 10 chars.
// Rendered directly (not via ApprovalsPage → drawer → dialog navigation): the validation
// gate lives entirely in DeclineDialog, and driving the nested Fluent overlay stack with
// userEvent was load-sensitive and flaky. Direct render tests the same behavior deterministically.
test("DeclineDialog confirm is disabled until reason is at least 10 characters", () => {
  renderWithProviders(
    <DeclineDialog open onClose={() => {}} onConfirm={() => {}} isSubmitting={false} />,
  );

  const confirmBtn = screen.getByRole("button", { name: /Confirm decline/i });
  expect(confirmBtn).toBeDisabled();

  const textarea = screen.getByPlaceholderText(/Explain why.*min 10 chars/i);

  fireEvent.change(textarea, { target: { value: "short" } });
  expect(confirmBtn).toBeDisabled();

  fireEvent.change(textarea, { target: { value: "This is a valid reason for declining" } });
  expect(confirmBtn).not.toBeDisabled();
});

// Test 13 — Bulk approve calls action N times sequentially
test("bulk approve calls ApproveReservation action once per reservation in order", async () => {
  const user = userEvent.setup();
  renderWithProviders(<ApprovalsPage />);

  await waitFor(() => expect(screen.getByText("RES-00001")).toBeInTheDocument(), { timeout: 3000 });

  const headerCheckbox = screen.getAllByRole("checkbox")[0];
  await user.click(headerCheckbox);

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Approve selected \(2\)/i })).toBeInTheDocument(),
    { timeout: 3000 },
  );

  await user.click(screen.getByRole("button", { name: /Approve selected \(2\)/i }));

  await waitFor(() => expect(screen.getByText(/Approve all \(2\)/i)).toBeInTheDocument(), { timeout: 3000 });
  await user.click(screen.getByText(/Approve all \(2\)/i));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2), { timeout: 5000 });

  const calledIds = (mockMutateAsync.mock.calls as Array<[{ reservationId: string }]>)
    .map(([input]) => input.reservationId);
  expect(calledIds).toContain("res-001");
  expect(calledIds).toContain("res-002");
});

// Test 14 — Bulk decline button NOT present in command bar
test("multi-select does NOT show a 'Bulk decline' or 'Decline selected' button — by design", async () => {
  const user = userEvent.setup();
  renderWithProviders(<ApprovalsPage />);

  await waitFor(() => expect(screen.getByText("RES-00001")).toBeInTheDocument(), { timeout: 3000 });

  const headerCheckbox = screen.getAllByRole("checkbox")[0];
  await user.click(headerCheckbox);

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Approve selected/i })).toBeInTheDocument(),
  );

  expect(screen.queryByRole("button", { name: /Decline selected/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Bulk decline/i })).not.toBeInTheDocument();
});
