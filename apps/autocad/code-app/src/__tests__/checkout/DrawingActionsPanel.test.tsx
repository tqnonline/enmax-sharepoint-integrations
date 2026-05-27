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
const mockCheckOutState: { isPending: boolean; isError: boolean } = { isPending: false, isError: false };
vi.mock("../../features/checkout/hooks/useCheckOut", () => ({
  useCheckOut: () => ({
    mutate: mockCheckOutMutate,
    isPending: mockCheckOutState.isPending,
    isError: mockCheckOutState.isError,
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

const mockFinalizeMutate = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useFinalizeDrawing", () => ({
  useFinalizeDrawing: () => ({ mutate: mockFinalizeMutate, isPending: false, isError: false, error: null, reset: vi.fn() }),
}));
const mockObsoleteMutate = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useMarkObsolete", () => ({
  useMarkObsolete: () => ({ mutate: mockObsoleteMutate, isPending: false, isError: false, error: null, reset: vi.fn() }),
}));
const mockVoidMutate = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useMarkVoid", () => ({
  useMarkVoid: () => ({ mutate: mockVoidMutate, isPending: false, isError: false, error: null, reset: vi.fn() }),
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
  mockCheckOutState.isPending = false;
  mockCheckOutState.isError = false;
  mockCheckOutMutate.mockClear();
  mockSubmitMutate.mockClear();
  mockApproveMutate.mockClear();
  mockForceMutate.mockClear();
  mockFinalizeMutate.mockClear();
  mockObsoleteMutate.mockClear();
  mockVoidMutate.mockClear();
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
// New matrix: CheckedOut by another user + User role → ReadOnlyStateLabel (no check out)
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

// Test 9 — ForceCheckInDialog visible to Admin/Approver when CheckedOut by another user
// New matrix: Admin or Approver (not admin-only) sees Force Check-In
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

test("ForceCheckInDialog trigger not visible to non-Admin non-Approver", () => {
  mockRole.value = "User";
  renderWithProviders(
    <DrawingActionsPanel
      drawing={makeDrawing(DrawingState.CheckedOut)}
      openCheckout={makeCheckout({ checkedOutBy: OTHER_USER_ID })}
    />,
  );
  expect(screen.queryByRole("button", { name: /force check-in/i })).not.toBeInTheDocument();
});

// Test 10 — ForceCheckInDialog requires revision + reason min 10 chars
// New: confirm button also requires newRevision to be non-empty
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
  // Initially disabled (reason empty, even if revision pre-filled)
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
  // CheckedOut by someone else, not an Admin/Approver — no action available
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

// Test 12 — New: Finalize button visible when drawing is Available
test("Finalize button visible when drawing is Available", () => {
  renderWithProviders(<DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} />);
  expect(screen.getByRole("button", { name: /finalize/i })).toBeInTheDocument();
});

// Test 13 — New: Admin sees Mark Obsolete and Mark Void on an Available drawing
test("Admin sees Mark Obsolete and Mark Void on an Available drawing", () => {
  mockRole.value = "Admin";
  renderWithProviders(<DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} />);
  expect(screen.getByRole("button", { name: /mark obsolete/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /mark void/i })).toBeInTheDocument();
});

// Test 14 — New: Non-admin does NOT see Mark Obsolete / Mark Void on an Available drawing
test("Non-admin does NOT see Mark Obsolete / Mark Void on an Available drawing", () => {
  mockRole.value = "User";
  renderWithProviders(<DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} />);
  expect(screen.queryByRole("button", { name: /mark obsolete/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /mark void/i })).not.toBeInTheDocument();
});

// Test 14b — Business rule: Finalize and Mark Obsolete require at least one prior check-in.
// A drawing with no currentRevision has never been checked in, so both are hidden.
// Check Out (to begin the first checkout) and Mark Void (not restricted) remain.
test("Finalize and Mark Obsolete are hidden on an Available drawing never checked in (no revision)", () => {
  mockRole.value = "Admin";
  renderWithProviders(
    <DrawingActionsPanel drawing={makeDrawing(DrawingState.Available, { currentRevision: "" })} />,
  );
  expect(screen.queryByRole("button", { name: /finalize/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /mark obsolete/i })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /mark void/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /check out/i })).toBeInTheDocument();
});

// Test 15 — New: Finalized drawing is read-only with no action buttons
test("Finalized drawing is read-only with no action buttons", () => {
  mockRole.value = "Admin";
  renderWithProviders(<DrawingActionsPanel drawing={makeDrawing(DrawingState.Finalized)} />);
  expect(screen.getByText("Finalized")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /check out/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /finalize/i })).not.toBeInTheDocument();
});

// ─── variant="split" tests ────────────────────────────────────────────────────

// Test 16 — Split mode: Admin Available drawing shows "Check Out" primary button
test("split mode: Admin Available drawing shows Check Out primary and More actions caret", () => {
  mockRole.value = "Admin";
  renderWithProviders(
    <DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} variant="split" />,
  );
  expect(screen.getByRole("button", { name: /^check out$/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /more actions/i })).toBeInTheDocument();
});

// Test 17 — Split mode: clicking "More actions" opens menu with Finalize/Mark Obsolete/Mark Void for Admin
test("split mode: Admin Available drawing More actions menu lists Finalize, Mark Obsolete, Mark Void", async () => {
  mockRole.value = "Admin";
  const user = userEvent.setup();
  renderWithProviders(
    <DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} variant="split" />,
  );

  await user.click(screen.getByRole("button", { name: /more actions/i }));

  expect(await screen.findByRole("menuitem", { name: /finalize/i })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /mark obsolete/i })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /mark void/i })).toBeInTheDocument();
});

// Test 18 — Split mode: clicking "Mark Void" in the overflow menu opens the void dialog
test("split mode: clicking Mark Void in overflow opens the void dialog", async () => {
  mockRole.value = "Admin";
  const user = userEvent.setup();
  renderWithProviders(
    <DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} variant="split" />,
  );

  await user.click(screen.getByRole("button", { name: /more actions/i }));
  const voidItem = await screen.findByRole("menuitem", { name: /mark void/i });
  await user.click(voidItem);

  // Void dialog title should appear
  expect(await screen.findByText(/confirm void/i)).toBeInTheDocument();
});

// Test 19 — Split mode: clicking primary "Check Out" calls useCheckOut mutate
test("split mode: clicking Check Out primary calls useCheckOut mutate with drawingId", async () => {
  mockRole.value = "User";
  const user = userEvent.setup();
  renderWithProviders(
    <DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} variant="split" />,
  );

  await user.click(screen.getByRole("button", { name: /^check out$/i }));
  expect(mockCheckOutMutate).toHaveBeenCalledWith("drawing-id-001");
});

// Test 20 — Split mode: non-Admin Available drawing overflow only shows Finalize (no Obsolete/Void)
test("split mode: non-Admin Available drawing overflow only has Finalize", async () => {
  mockRole.value = "User";
  const user = userEvent.setup();
  renderWithProviders(
    <DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} variant="split" />,
  );

  await user.click(screen.getByRole("button", { name: /more actions/i }));

  expect(await screen.findByRole("menuitem", { name: /finalize/i })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /mark obsolete/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /mark void/i })).not.toBeInTheDocument();
});

// Test 21 — Split mode: Check Out primary is disabled and shows "Checking out…" while pending
test("split mode: Check Out primary is disabled and shows Checking out… while isPending", () => {
  mockCheckOutState.isPending = true;
  renderWithProviders(
    <DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} variant="split" />,
  );
  const btn = screen.getByRole("button", { name: /checking out/i });
  expect(btn).toBeInTheDocument();
  expect(btn).toBeDisabled();
});

// Test 22 — Split mode: error message appears when checkOut.isError is true
test("split mode: error message appears when checkOut.isError is true", () => {
  mockCheckOutState.isError = true;
  renderWithProviders(
    <DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} variant="split" />,
  );
  expect(screen.getByText(/check out failed/i)).toBeInTheDocument();
});
