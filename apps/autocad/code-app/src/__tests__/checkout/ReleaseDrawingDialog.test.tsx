import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { ReleaseDrawingDialog } from "../../features/checkout/components/ReleaseDrawingDialog";

const mockMutate = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useReleaseDrawing", () => ({
  useReleaseDrawing: () => ({
    mutate: mockMutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

afterEach(() => mockMutate.mockClear());

const VALID_REASON = "no longer required by the business";

test("Confirm Release is disabled until reason is at least 10 characters", () => {
  renderWithProviders(<ReleaseDrawingDialog drawingId="d1" open onOpenChange={() => {}} />);
  const confirm = screen.getByRole("button", { name: /confirm release/i });
  expect(confirm).toBeDisabled();

  fireEvent.change(screen.getByRole("textbox"), { target: { value: "too short" } });
  expect(confirm).toBeDisabled();

  fireEvent.change(screen.getByRole("textbox"), { target: { value: VALID_REASON } });
  expect(confirm).toBeEnabled();
});

test("Confirm calls release mutation with the trimmed reason", () => {
  renderWithProviders(<ReleaseDrawingDialog drawingId="d1" open onOpenChange={() => {}} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: `  ${VALID_REASON}  ` } });
  fireEvent.click(screen.getByRole("button", { name: /confirm release/i }));
  expect(mockMutate).toHaveBeenCalledWith(
    { drawingId: "d1", reason: VALID_REASON },
    expect.anything(),
  );
});

test("force-release shows the on-behalf-of warning; self-release does not", () => {
  const { unmount } = renderWithProviders(
    <ReleaseDrawingDialog drawingId="d1" open onOpenChange={() => {}} forceRelease />,
  );
  expect(screen.getByText(/on their behalf/i)).toBeInTheDocument();
  unmount();

  renderWithProviders(<ReleaseDrawingDialog drawingId="d1" open onOpenChange={() => {}} />);
  expect(screen.queryByText(/on their behalf/i)).not.toBeInTheDocument();
});
