import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { BroadcastCarousel } from "../../features/home/BroadcastCarousel";
import type { HomeBroadcast } from "../../features/home/useHomeData";

vi.mock("../../features/home/useHomeData", () => ({
  useDismissBroadcast: () => ({ mutate: vi.fn(), isPending: false }),
}));

const TWO: HomeBroadcast[] = [
  { id: "b1", title: "Critical outage", body: "Body one.", severity: 3, pinned: true, requiresAck: false },
  { id: "b2", title: "Heads up", body: "Body two.", severity: 2, pinned: false, requiresAck: true },
];

test("shows one broadcast at a time with a position counter", () => {
  renderWithProviders(<BroadcastCarousel broadcasts={TWO} />);
  expect(screen.getByText("Critical outage")).toBeInTheDocument();
  expect(screen.queryByText("Heads up")).not.toBeInTheDocument();
  expect(screen.getByText("1 of 2")).toBeInTheDocument();
});

// WHY: a pinned broadcast must read as sticky — its slide carries a pin indicator, a non-pinned one doesn't.
test("Next advances and the pin indicator tracks the pinned flag", async () => {
  const user = userEvent.setup();
  renderWithProviders(<BroadcastCarousel broadcasts={TWO} />);
  expect(screen.getByTitle("Pinned")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /next broadcast/i }));
  expect(screen.getByText("Heads up")).toBeInTheDocument();
  expect(screen.getByText("2 of 2")).toBeInTheDocument();
  expect(screen.queryByTitle("Pinned")).not.toBeInTheDocument();
});

// WHY: rotation/navigation only makes sense with >1 — a single broadcast shows no controls.
test("a single broadcast renders no rotation controls", () => {
  renderWithProviders(<BroadcastCarousel broadcasts={[TWO[1]]} />);
  expect(screen.getByText("Heads up")).toBeInTheDocument();
  expect(screen.queryByText(/of 1/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /next broadcast/i })).not.toBeInTheDocument();
});
