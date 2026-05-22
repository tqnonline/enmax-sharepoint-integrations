import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { DrawingActionsPanel } from "../../features/checkout/components/DrawingActionsPanel";
import { DrawingState } from "../../features/checkout/api/checkoutClient";
import type { DrawingForPanel, CheckoutForPanel } from "../../features/checkout/api/checkoutClient";
import type { Role } from "../../auth/useUserRole";

// ─── shared mocks ────────────────────────────────────────────────────────────

const CURRENT_USER_ID = "user-current-00000001";
const OTHER_USER_ID   = "user-other-000000002";

vi.mock("../../auth/useCurrentUser", () => ({
  useCurrentUser: () => ({
    data: { id: CURRENT_USER_ID, displayName: "Test User", userPrincipalName: "test@example.com" },
    isPending: false,
  }),
}));

const mockRole: { value: Role } = { value: "User" };
vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: mockRole.value, isPending: false }),
}));

const mockCheckOutMutate = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useCheckOut", () => ({
  useCheckOut: () => ({
    mutate: mockCheckOutMutate,
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

const mockSubmitMutate = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useSubmitRevision", () => ({
  useSubmitRevision: () => ({
    mutate: mockSubmitMutate,
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

const mockApproveMutate = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useApproveCheckin", () => ({
  useApproveCheckin: () => ({
    mutate: mockApproveMutate,
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

const mockForceMutate = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useForceCheckin", () => ({
  useForceCheckin: () => ({
    mutate: mockForceMutate,
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

const mockCheckInMutate = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useCheckIn", () => ({
  useCheckIn: () => ({
    mutate: mockCheckInMutate,
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

// Default: RequireCheckInApproval=false → trigger="Check In", confirm="Confirm Check In"
const mockConfig: { RequireCheckInApproval: boolean } = { RequireCheckInApproval: false };
vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => mockConfig,
}));

const server = setupServer(
  http.post("*/enmax_autocaddrawings*enmax_acdnCheckOutDrawing*", () =>
    HttpResponse.json({ CheckoutId: "checkout-id-001" }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  mockRole.value = "User";
  mockConfig.RequireCheckInApproval = false;
  mockCheckOutMutate.mockClear();
  mockSubmitMutate.mockClear();
  mockApproveMutate.mockClear();
  mockForceMutate.mockClear();
  mockCheckInMutate.mockClear();
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeDrawing(state: number, overrides: Partial<DrawingForPanel> = {}): DrawingForPanel {
  return {
    id: "drawing-id-001",
    state: state as DrawingForPanel["state"],
    number: "GG-CG-00-ECS-AST-DD-0001",
    currentRevision: "A",
    ...overrides,
  };
}

function makeCheckout(overrides: Partial<CheckoutForPanel> = {}): CheckoutForPanel {
  return {
    id: "checkout-id-001",
    checkedOutBy: CURRENT_USER_ID,
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

// Test 1a — CheckOutButton visible when Drawing.state=Available
test("CheckOutButton renders when drawing state is Available", () => {
  renderWithProviders(
    <DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} />,
  );
  expect(screen.getByRole("button", { name: /check out/i })).toBeInTheDocument();
});

// Test 1b — CheckOutButton absent when Drawing is not Available
test("CheckOutButton absent when drawing is CheckedOut by another user", () => {
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.CheckedOut)}
      openCheckout={makeCheckout({ checkedOutBy: OTHER_USER_ID })}
    />,
  );
  expect(screen.queryByRole("button", { name: /check out/i })).not.toBeInTheDocument();
});

// Test 2 — CheckOutButton calls action and invalidates queries on success
test("CheckOutButton calls useCheckOut mutate with drawingId on click", async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} />,
  );

  await user.click(screen.getByRole("button", { name: /check out/i }));
  expect(mockCheckOutMutate).toHaveBeenCalledWith("drawing-id-001");
});

// Test 3 — SubmitRevisionDrawer visible only to Checkout owner
// Default config: RequireCheckInApproval=false → button says "Check In"
test("SubmitRevisionDrawer trigger appears only when current user owns the checkout", () => {
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.CheckedOut)}
      openCheckout={makeCheckout({ checkedOutBy: CURRENT_USER_ID })}
    />,
  );
  expect(screen.getByRole("button", { name: /check in/i })).toBeInTheDocument();
});

test("SubmitRevisionDrawer trigger hidden when another user owns the checkout", () => {
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.CheckedOut)}
      openCheckout={makeCheckout({ checkedOutBy: OTHER_USER_ID })}
    />,
  );
  expect(screen.queryByRole("button", { name: /^check in$/i })).not.toBeInTheDocument();
});

// Test 4 — SubmitRevisionDrawer requires filesConfirmed checkbox before submit
// RequireCheckInApproval=false → trigger="Check In", confirm="Confirm Check In"
test("SubmitRevisionDrawer submit is disabled until filesConfirmed checkbox is checked", async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.CheckedOut)}
      openCheckout={makeCheckout()}
    />,
  );

  await user.click(screen.getByRole("button", { name: /check in/i }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /confirm check in/i })).toBeInTheDocument(),
    { timeout: 3000 },
  );

  const submitBtn = screen.getByRole("button", { name: /confirm check in/i });
  expect(submitBtn).toBeDisabled();

  const checkbox = screen.getByRole("checkbox");
  await user.click(checkbox);

  await waitFor(() => expect(submitBtn).not.toBeDisabled(), { timeout: 2000 });
});

// Test 4b — RequireCheckInApproval=true → trigger="Submit Revision", confirm="Submit for Validation"
test("SubmitRevisionDrawer shows Submit for Validation when RequireCheckInApproval is true", async () => {
  mockConfig.RequireCheckInApproval = true;
  const user = userEvent.setup();
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.CheckedOut)}
      openCheckout={makeCheckout()}
    />,
  );

  await user.click(screen.getByRole("button", { name: /submit revision/i }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /submit for validation/i })).toBeInTheDocument(),
    { timeout: 3000 },
  );
});

// Test 5 — SubmitRevisionDrawer suggests next revision letter (A→B)
test("SubmitRevisionDrawer defaults to next letter revision when current revision is a letter", async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.CheckedOut, { currentRevision: "A" })}
      openCheckout={makeCheckout()}
    />,
  );

  await user.click(screen.getByRole("button", { name: /check in/i }));

  await waitFor(() => expect(screen.getByLabelText(/new revision identifier/i)).toBeInTheDocument());
  expect((screen.getByLabelText(/new revision identifier/i) as HTMLInputElement).value).toBe("B");
});

// Test 6 — SubmitRevisionDrawer suggests next revision number (01→02)
test("SubmitRevisionDrawer defaults to next padded number when current revision is numeric", async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.CheckedOut, { currentRevision: "01" })}
      openCheckout={makeCheckout()}
    />,
  );

  await user.click(screen.getByRole("button", { name: /check in/i }));

  await waitFor(() => expect(screen.getByLabelText(/new revision identifier/i)).toBeInTheDocument());
  expect((screen.getByLabelText(/new revision identifier/i) as HTMLInputElement).value).toBe("02");
});

// Test 7 — ValidationDrawer visible to Approver/Admin when AwaitingValidation
test("ValidationDrawer trigger visible to Approver when drawing is AwaitingValidation", () => {
  mockRole.value = "Approver";
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.AwaitingValidation)}
      openCheckout={makeCheckout({ checkedOutBy: OTHER_USER_ID })}
    />,
  );
  expect(screen.getByRole("button", { name: /review revision/i })).toBeInTheDocument();
});

test("ValidationDrawer trigger visible to Admin when drawing is AwaitingValidation", () => {
  mockRole.value = "Admin";
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.AwaitingValidation)}
      openCheckout={makeCheckout({ checkedOutBy: OTHER_USER_ID })}
    />,
  );
  expect(screen.getByRole("button", { name: /review revision/i })).toBeInTheDocument();
});

test("ValidationDrawer trigger hidden from User role when drawing is AwaitingValidation", () => {
  mockRole.value = "User";
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.AwaitingValidation)}
      openCheckout={makeCheckout({ checkedOutBy: OTHER_USER_ID })}
    />,
  );
  expect(screen.queryByRole("button", { name: /review revision/i })).not.toBeInTheDocument();
});

// Test 8 — ValidationDrawer hides Approve when missing sheets present
test("ValidationDrawer Approve button is disabled when drawing has missing sheets", async () => {
  mockRole.value = "Approver";
  const user = userEvent.setup();
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.AwaitingValidation, { missingSheets: "Sheet 3, Sheet 5" })}
      openCheckout={makeCheckout({ checkedOutBy: OTHER_USER_ID })}
    />,
  );

  await user.click(screen.getByRole("button", { name: /review revision/i }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument(),
    { timeout: 3000 },
  );
  expect(screen.getByRole("button", { name: /approve/i })).toBeDisabled();
});

// Test 9 — ForceCheckInDialog visible to Admin only
test("ForceCheckInDialog trigger visible to Admin when drawing is CheckedOut by another user", () => {
  mockRole.value = "Admin";
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.CheckedOut)}
      openCheckout={makeCheckout({ checkedOutBy: OTHER_USER_ID })}
    />,
  );
  expect(screen.getByRole("button", { name: /force check-in/i })).toBeInTheDocument();
});

test("ForceCheckInDialog trigger not visible to non-Admin", () => {
  mockRole.value = "User";
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.CheckedOut)}
      openCheckout={makeCheckout({ checkedOutBy: OTHER_USER_ID })}
    />,
  );
  expect(screen.queryByRole("button", { name: /force check-in/i })).not.toBeInTheDocument();
});

// Test 10 — ForceCheckInDialog requires reason min 10 chars
test("ForceCheckInDialog confirm button disabled when reason is shorter than 10 characters", async () => {
  mockRole.value = "Admin";
  const user = userEvent.setup();
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.CheckedOut)}
      openCheckout={makeCheckout({ checkedOutBy: OTHER_USER_ID })}
    />,
  );

  await user.click(screen.getByRole("button", { name: /force check-in/i }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /confirm force check-in/i })).toBeInTheDocument(),
    { timeout: 3000 },
  );

  const confirmBtn = screen.getByRole("button", { name: /confirm force check-in/i });
  expect(confirmBtn).toBeDisabled();

  const textarea = screen.getByPlaceholderText(/min 10 chars/i);
  fireEvent.change(textarea, { target: { value: "short" } });
  await waitFor(() => expect(confirmBtn).toBeDisabled());

  fireEvent.change(textarea, { target: { value: "This is a valid reason for force close" } });
  await waitFor(() => expect(confirmBtn).not.toBeDisabled(), { timeout: 2000 });
});

// Test 11 — DrawingActionsPanel returns ReadOnlyStateLabel when no actions available
test("DrawingActionsPanel shows state badge (ReadOnlyStateLabel) when user has no valid action", () => {
  mockRole.value = "User";
  // CheckedOut by someone else, not an Admin — no action available
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.CheckedOut)}
      openCheckout={makeCheckout({ checkedOutBy: OTHER_USER_ID })}
    />,
  );
  // Should show "Checked Out" badge — use exact badge text
  expect(screen.getByText("Checked Out")).toBeInTheDocument();
  // No action buttons
  expect(screen.queryByRole("button", { name: /check out/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /check in/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /force check-in/i })).not.toBeInTheDocument();
});
