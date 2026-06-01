import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { NotificationsPage } from "../../features/notifications/NotificationsPage";

const USER = "00000000-0000-0000-0000-000000000001";
const NOW = new Date().toISOString();

type Row = Record<string, unknown>;
const notifsRef: { value: Row[] } = { value: [] };
const markReadFn = vi.fn();
const markAllFn = vi.fn();

vi.mock("../../auth/useCurrentUser", () => ({ useCurrentUser: () => ({ data: { id: USER } }) }));
vi.mock("../../app/useNotificationFeed", () => ({
  useNotificationFeed: () => ({ data: notifsRef.value, isPending: false }),
  useMarkNotificationRead: () => ({ mutate: markReadFn }),
  useMarkAllNotificationsRead: () => ({ mutate: markAllFn, isPending: false }),
}));

afterEach(() => { notifsRef.value = []; markReadFn.mockClear(); markAllFn.mockClear(); });

test("renders the page header and a notification grouped under Today", () => {
  notifsRef.value = [{ id: "n1", title: "Reservation approved", body: "Numbers issued", severity: 2, read: false, deepLinkPath: "/reservations/r1", createdOn: NOW }];
  renderWithProviders(<NotificationsPage />);
  expect(screen.getByRole("heading", { level: 1, name: /notifications/i })).toBeInTheDocument();
  expect(screen.getByText("Today")).toBeInTheDocument();
  expect(screen.getByText("Reservation approved")).toBeInTheDocument();
});

test("empty feed shows the all-caught-up state", () => {
  renderWithProviders(<NotificationsPage />);
  expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
});

test("Mark all read fires the bulk mutation with the unread ids", async () => {
  const user = userEvent.setup();
  notifsRef.value = [
    { id: "n1", title: "A", body: "", severity: 1, read: false, deepLinkPath: "", createdOn: NOW },
    { id: "n2", title: "B", body: "", severity: 1, read: true, deepLinkPath: "", createdOn: NOW },
  ];
  renderWithProviders(<NotificationsPage />);
  await user.click(screen.getByRole("button", { name: /mark all read/i }));
  expect(markAllFn).toHaveBeenCalledWith(["n1"]);
});
