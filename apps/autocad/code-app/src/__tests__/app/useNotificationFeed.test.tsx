import { type ReactNode } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMarkAllNotificationsRead, type NotificationItem } from "../../app/useNotificationFeed";

const update = vi.fn();
vi.mock("../../generated", () => ({
  Enmax_autocadinappnotificationsService: { update: (...a: unknown[]) => update(...a) },
}));

const USER = "00000000-0000-0000-0000-000000000001";
const KEY = ["notification-feed", USER, 50]; // default limit is part of the key
const UNREAD: NotificationItem[] = [
  { id: "a", title: "A", body: "", severity: 1, read: false, deepLinkPath: "", createdOn: "" },
  { id: "b", title: "B", body: "", severity: 1, read: false, deepLinkPath: "", createdOn: "" },
];

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

afterEach(() => update.mockReset());

// WHY (plan #08 test 8): the feed must feel instant — flip to read before the network returns.
test("mark all read updates the cache optimistically", async () => {
  update.mockResolvedValue({});
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(KEY, UNREAD);
  const { result } = renderHook(() => useMarkAllNotificationsRead(USER), { wrapper: wrapper(qc) });

  act(() => { result.current.mutate(["a", "b"]); });

  await waitFor(() =>
    expect((qc.getQueryData(KEY) as NotificationItem[]).every((n) => n.read)).toBe(true),
  );
});

// WHY (plan #08 test 9): a failed bulk PATCH must not leave a lie on screen — roll back to unread.
test("mark all read rolls back when the API fails", async () => {
  update.mockRejectedValue(new Error("boom"));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(KEY, UNREAD);
  const { result } = renderHook(() => useMarkAllNotificationsRead(USER), { wrapper: wrapper(qc) });

  await act(async () => {
    try { await result.current.mutateAsync(["a", "b"]); } catch { /* expected */ }
  });

  await waitFor(() =>
    expect((qc.getQueryData(KEY) as NotificationItem[]).some((n) => !n.read)).toBe(true),
  );
});
