import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { CheckoutApprovalDrawer } from "../../features/checkout/components/CheckoutApprovalDrawer";

const mockMutate = vi.hoisted(() => vi.fn());

vi.mock("../../features/checkout/hooks/useApproveCheckout", () => ({
  useApproveCheckout: () => ({ mutate: mockMutate, reset: vi.fn(), isPending: false, isError: false, error: null }),
}));

afterEach(() => mockMutate.mockClear());

function open() {
  return renderWithProviders(
    <CheckoutApprovalDrawer checkoutId="co-1" drawingNumber="GG-CG-00-ECS-AST-DD-0001" requestedByName="Alice Smith" />,
  );
}

test("Approve sends an Approved decision with no reason", async () => {
  const user = userEvent.setup();
  open();

  await user.click(screen.getByRole("button", { name: /review request/i }));
  await waitFor(() => expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: /^approve$/i }));

  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockMutate.mock.calls[0][0]).toMatchObject({ checkoutId: "co-1", decision: "Approved" });
});

test("Decline requires a reason of at least 10 characters before confirming", async () => {
  const user = userEvent.setup();
  open();

  await user.click(screen.getByRole("button", { name: /review request/i }));
  await waitFor(() => expect(screen.getByRole("button", { name: /^decline$/i })).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /^decline$/i }));

  const confirmBtn = await screen.findByRole("button", { name: /confirm decline/i });
  expect(confirmBtn).toBeDisabled();

  fireEvent.change(screen.getByPlaceholderText(/min 10 chars/i), { target: { value: "too short" } });
  await waitFor(() => expect(confirmBtn).toBeDisabled());

  fireEvent.change(screen.getByPlaceholderText(/min 10 chars/i), {
    target: { value: "Not authorized for this vendor package right now." },
  });
  await waitFor(() => expect(confirmBtn).not.toBeDisabled());

  await user.click(confirmBtn);
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockMutate.mock.calls[0][0]).toMatchObject({ checkoutId: "co-1", decision: "Declined" });
  expect((mockMutate.mock.calls[0][0] as { reason: string }).reason.length).toBeGreaterThanOrEqual(10);
});
