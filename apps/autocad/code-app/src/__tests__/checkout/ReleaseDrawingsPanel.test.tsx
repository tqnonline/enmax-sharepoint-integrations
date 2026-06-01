import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { ReleaseDrawingsPanel } from "../../features/checkout/components/ReleaseDrawingsPanel";
import { DrawingState } from "../../features/checkout/api/checkoutClient";
import type { DrawingForPanel } from "../../features/checkout/api/checkoutClient";

const mockMutateAsync = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useReleaseDrawing", () => ({
  useReleaseDrawing: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

afterEach(() => mockMutateAsync.mockReset());

const drawings: DrawingForPanel[] = [
  { id: "d1", number: "0001", state: DrawingState.Available },
  { id: "d2", number: "0002", state: DrawingState.Available },
  { id: "d3", number: "0003", state: DrawingState.CheckedOut },
];

test("lists only Available drawings and releases each selected one sequentially", async () => {
  mockMutateAsync.mockResolvedValue({ newState: "Void", sequenceKeyBurned: "x" });
  renderWithProviders(<ReleaseDrawingsPanel drawings={drawings} open onOpenChange={() => {}} />);

  // CheckedOut drawing is not selectable
  expect(screen.queryByText("0003")).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText(/select 0001/i));
  fireEvent.click(screen.getByLabelText(/select 0002/i));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "batch cleanup of unused numbers" } });
  fireEvent.click(screen.getByRole("button", { name: /release 2/i }));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));
  expect(mockMutateAsync).toHaveBeenCalledWith({ drawingId: "d1", reason: "batch cleanup of unused numbers" });
  expect(mockMutateAsync).toHaveBeenCalledWith({ drawingId: "d2", reason: "batch cleanup of unused numbers" });
});

test("Release button stays disabled until a drawing is selected and a valid reason is entered", () => {
  renderWithProviders(<ReleaseDrawingsPanel drawings={drawings} open onOpenChange={() => {}} />);
  expect(screen.getByRole("button", { name: /^release 0$/i })).toBeDisabled();

  fireEvent.click(screen.getByLabelText(/select 0001/i));
  expect(screen.getByRole("button", { name: /^release 1$/i })).toBeDisabled(); // reason still empty

  fireEvent.change(screen.getByRole("textbox"), { target: { value: "valid release reason here" } });
  expect(screen.getByRole("button", { name: /^release 1$/i })).toBeEnabled();
});

test("excludes Available drawings that were ever checked out (have a revision)", () => {
  const mixed: DrawingForPanel[] = [
    { id: "n1", number: "0010", state: DrawingState.Available },                       // never checked in -> listed
    { id: "n2", number: "0011", state: DrawingState.Available, currentRevision: "A" }, // checked in once -> excluded
  ];
  renderWithProviders(<ReleaseDrawingsPanel drawings={mixed} open onOpenChange={() => {}} />);
  expect(screen.getByText("0010")).toBeInTheDocument();
  expect(screen.queryByText("0011")).not.toBeInTheDocument();
});
