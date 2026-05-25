import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import { renderWithProviders } from "../helpers/renderWithProviders";
import ReservationDetail from "../../pages/ReservationDetail";

const mockDetail = {
  data: {
    id: "res-1",
    number: "RES-2026-0001",
    status: 1,
    drawingCount: 0,
    reason: "Test",
    createdon: new Date().toISOString(),
    override: false,
    submitterId: "user-1",
    submitterName: "Owner User",
    drawings: [],
  },
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
};
const mockUserId = { value: "user-1" };
const mockCancelMutate = vi.fn();

vi.mock("../../features/approvals/hooks/useReservationDetail", () => ({
  useReservationDetail: () => mockDetail,
}));
vi.mock("../../auth/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: { id: mockUserId.value }, isPending: false }),
}));
vi.mock("../../features/myitems/useMyReservations", () => ({
  useCancelReservation: () => ({
    mutate: mockCancelMutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));
vi.mock("../../features/checkout/hooks/useReservationDrawings", () => ({
  useReservationDrawings: () => ({ data: [], isPending: false }),
}));

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="reservations/:reservationId" element={<ReservationDetail />} />
    </Routes>,
    { initialPath: "/reservations/res-1" },
  );
}

beforeEach(() => {
  mockDetail.data.status = 1;
  mockUserId.value = "user-1";
});
afterEach(() => vi.clearAllMocks());

// Owner of a pending reservation can cancel; confirming calls the cancel mutation with the id.
test("owner can cancel a pending reservation", async () => {
  const user = userEvent.setup();
  renderDetail();

  await user.click(screen.getByRole("button", { name: /cancel reservation/i }));
  // Confirm dialog
  await user.click(screen.getByRole("button", { name: /confirm cancel/i }));

  expect(mockCancelMutate).toHaveBeenCalledWith("res-1", expect.anything());
});

// Cancel must not be offered to a non-owner (preserves the original My-Items owner-only semantics).
test("non-owner does not see Cancel", () => {
  mockUserId.value = "someone-else";
  renderDetail();
  expect(screen.queryByRole("button", { name: /cancel reservation/i })).not.toBeInTheDocument();
});

// Cancel only applies to pending reservations — an approved one cannot be cancelled here.
test("approved reservation does not show Cancel", () => {
  mockDetail.data.status = 2;
  renderDetail();
  expect(screen.queryByRole("button", { name: /cancel reservation/i })).not.toBeInTheDocument();
});
