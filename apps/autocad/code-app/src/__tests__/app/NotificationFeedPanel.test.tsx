import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { NotificationFeedPanel } from "../../app/NotificationFeedPanel";

const USER = "00000000-0000-0000-0000-000000000001";
const NOW = new Date().toISOString();

type Row = Record<string, unknown>;
const notifsRef: { value: Row[] } = { value: [] };
const navFn = vi.fn();
const markReadFn = vi.fn();
const markAllFn = vi.fn();
const onClose = vi.fn();

vi.mock("../../auth/useCurrentUser", () => ({ useCurrentUser: () => ({ data: { id: USER } }) }));
vi.mock("../../app/useNotificationFeed", () => ({
  useNotificationFeed: () => ({ data: notifsRef.value, isPending: false }),
  useMarkNotificationRead: () => ({ mutate: markReadFn }),
  useMarkAllNotificationsRead: () => ({ mutate: markAllFn, isPending: false }),
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navFn,
}));

afterEach(() => {
  notifsRef.value = [];
  navFn.mockClear(); markReadFn.mockClear(); markAllFn.mockClear(); onClose.mockClear();
});

test("empty feed shows the all-caught-up state", () => {
  renderWithProviders(<NotificationFeedPanel onClose={onClose} />);
  expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
});

test("groups recent items under Today", () => {
  notifsRef.value = [{ id: "n1", title: "Reservation approved", body: "Numbers issued", severity: 2, read: false, deepLinkPath: "/reservations/r1", createdOn: NOW }];
  renderWithProviders(<NotificationFeedPanel onClose={onClose} />);
  expect(screen.getByText("Today")).toBeInTheDocument();
  expect(screen.getByText("Reservation approved")).toBeInTheDocument();
});

// WHY (plan #08 test 11): clicking a feed item must both navigate to its deep link and mark it read.
test("clicking a notification navigates to its deep link and marks it read", async () => {
  const user = userEvent.setup();
  notifsRef.value = [{ id: "n1", title: "Reservation approved", body: "Numbers issued", severity: 2, read: false, deepLinkPath: "/reservations/r1", createdOn: NOW }];
  renderWithProviders(<NotificationFeedPanel onClose={onClose} />);
  await user.click(screen.getByText("Reservation approved"));
  expect(markReadFn).toHaveBeenCalledWith("n1");
  expect(navFn).toHaveBeenCalledWith("/reservations/r1");
  expect(onClose).toHaveBeenCalled();
});

// WHY (plan #08 test 8): Mark all read fires the bulk mutation with just the unread ids.
test("Mark all read fires the bulk mutation with the unread ids", async () => {
  const user = userEvent.setup();
  notifsRef.value = [
    { id: "n1", title: "A", body: "", severity: 1, read: false, deepLinkPath: "", createdOn: NOW },
    { id: "n2", title: "B", body: "", severity: 1, read: true, deepLinkPath: "", createdOn: NOW },
  ];
  renderWithProviders(<NotificationFeedPanel onClose={onClose} />);
  await user.click(screen.getByRole("button", { name: /mark all read/i }));
  expect(markAllFn).toHaveBeenCalledWith(["n1"]); // only the unread id
});

// WHY: the bell is a glance; the full history lives on a page reachable from its footer.
test("See all notifications navigates to the full page and closes the popover", async () => {
  const user = userEvent.setup();
  renderWithProviders(<NotificationFeedPanel onClose={onClose} />);
  await user.click(screen.getByRole("button", { name: /see all notifications/i }));
  expect(navFn).toHaveBeenCalledWith("/notifications");
  expect(onClose).toHaveBeenCalled();
});
