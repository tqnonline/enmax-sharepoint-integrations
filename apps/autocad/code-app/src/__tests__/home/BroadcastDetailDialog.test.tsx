import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { BroadcastDetailDialog } from "../../features/home/BroadcastDetailDialog";
import type { HomeBroadcast } from "../../features/home/useHomeData";

const mutate = vi.fn();
vi.mock("../../features/home/useHomeData", () => ({
  useDismissBroadcast: () => ({ mutate, isPending: false }),
}));

const INFO: HomeBroadcast = {
  id: "b1", title: "Scheduled maintenance", body: "Systems offline Sunday 2–4am MT.",
  severity: 2, pinned: false, requiresAck: false,
};
const ACK: HomeBroadcast = {
  id: "b2", title: "Policy change", body: "All drawings must be uploaded to SharePoint.",
  severity: 3, pinned: false, requiresAck: true,
};
const PINNED: HomeBroadcast = {
  id: "b3", title: "System notice", body: "Read-only window every Sunday.",
  severity: 1, pinned: true, requiresAck: false,
};

afterEach(() => mutate.mockClear());

test("shows the full body so a truncated banner can be read in full", () => {
  renderWithProviders(<BroadcastDetailDialog broadcast={INFO} open onClose={() => {}} />);
  expect(screen.getByText("Systems offline Sunday 2–4am MT.")).toBeInTheDocument();
});

// WHY: a non-ack broadcast is cleared with Dismiss → records acknowledged=false (seen, not acked).
test("Dismiss writes a non-acknowledged dismissal", async () => {
  const user = userEvent.setup();
  renderWithProviders(<BroadcastDetailDialog broadcast={INFO} open onClose={() => {}} />);
  await user.click(screen.getByRole("button", { name: /dismiss/i }));
  expect(mutate.mock.calls[0][0]).toEqual({ broadcastId: "b1", acknowledged: false });
});

// WHY: an ack-required broadcast must be Acknowledged (not merely dismissed) → acknowledged=true.
test("ack-required broadcast offers Acknowledge and records acknowledged=true", async () => {
  const user = userEvent.setup();
  renderWithProviders(<BroadcastDetailDialog broadcast={ACK} open onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: /^dismiss$/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /acknowledge/i }));
  expect(mutate.mock.calls[0][0]).toEqual({ broadcastId: "b2", acknowledged: true });
});

// WHY: pinned broadcasts are sticky — they can't be dismissed or acknowledged away, only closed.
test("a pinned broadcast offers no Dismiss/Acknowledge, only Close", () => {
  renderWithProviders(<BroadcastDetailDialog broadcast={PINNED} open onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /acknowledge/i })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  expect(mutate).not.toHaveBeenCalled();
});
