/**
 * Critical cross-page grid filter contract:
 * - Date grids default to today − 30 days through today
 * - Optional text/people filters apply only when the user enters values
 * - Clear resets draft + applied filters to the default window
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { GRID_DEFAULT_FROM_DAYS, isoDateDaysAgo, isoDateToday } from "../../lib/dateRangeDefaults";
import { isDefaultGridDateRange } from "../../lib/gridListFilters";

const FIXED_NOW = new Date("2026-07-09T12:00:00.000Z");
const mockRole = { value: "User" as "User" | "Admin" | "Approver" };

function expectDefaultDateInputs() {
  const from = screen.getByLabelText("From date") as HTMLInputElement;
  const to = screen.getByLabelText("To date") as HTMLInputElement;
  expect(isDefaultGridDateRange(from.value, to.value, FIXED_NOW)).toBe(true);
  expect(from.value).toBe(isoDateDaysAgo(GRID_DEFAULT_FROM_DAYS, FIXED_NOW));
  expect(to.value).toBe(isoDateToday(FIXED_NOW));
  return { from, to };
}

// ─── My Items ────────────────────────────────────────────────────────────────

vi.mock("../../auth/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: { id: "user-1", name: "Test User" }, isPending: false }),
}));
vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: mockRole.value, isPending: false }),
}));
vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => ({ GridPageSize: 10, RequireCheckInApproval: false }),
}));
vi.mock("../../features/approvals/hooks/useCompositionLookups", () => ({
  useCompositionLookups: () => ({
    data: {
      bizMap: new Map(), assetMap: new Map(), unitMap: new Map(),
      domainMap: new Map(), sysMap: new Map(), kindMap: new Map(),
    },
  }),
}));

const capturedMyItemsFilters: { last?: unknown } = {};

vi.mock("../../features/myitems/useMyRecords", async () => {
  const actual = await vi.importActual<typeof import("../../features/myitems/useMyRecords")>(
    "../../features/myitems/useMyRecords",
  );
  return {
    ...actual,
    fetchMyRecordCounts: async () => ({
      reservations: { value: 0, capped: false },
      available: { value: 0, capped: false },
      checkedout: { value: 0, capped: false },
      pendingapproval: { value: 0, capped: false },
    }),
    fetchMyRecordAllCounts: async () => ({
      reservations: { value: 0, capped: false },
      available: { value: 0, capped: false },
      checkedout: { value: 0, capped: false },
      pendingapproval: { value: 0, capped: false },
    }),
    fetchMyRecordRows: async (
      _userId: string,
      _type: string,
      _state: string,
      _params: unknown,
      filters: unknown,
    ) => {
      capturedMyItemsFilters.last = filters;
      return { rows: [], totalCount: 0 };
    },
  };
});

describe("My Items grid filters", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
    capturedMyItemsFilters.last = undefined;
  });
  afterEach(() => vi.useRealTimers());

  it("loads reservations tab with default 30-day range applied to fetches", async () => {
    const { MyItemsPage } = await import("../../features/myitems/MyItemsPage");
    renderWithProviders(<MyItemsPage />);
    expectDefaultDateInputs();
    await waitFor(() => {
      expect(capturedMyItemsFilters.last).toMatchObject({
        from: isoDateDaysAgo(30, FIXED_NOW),
        to: isoDateToday(FIXED_NOW),
        number: "",
        peopleIds: [],
      });
    });
  });

  it("loads available tab with default 30-day range applied to fetches", async () => {
    const { MyItemsPage } = await import("../../features/myitems/MyItemsPage");
    renderWithProviders(<MyItemsPage />, { initialPath: "/my-items?type=drawings&state=available" });
    expectDefaultDateInputs();
    await waitFor(() => {
      expect(capturedMyItemsFilters.last).toMatchObject({
        from: isoDateDaysAgo(30, FIXED_NOW),
        to: isoDateToday(FIXED_NOW),
        number: "",
        peopleIds: [],
      });
    });
  });

  it("Clear resets available tab to default 30-day window", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { MyItemsPage } = await import("../../features/myitems/MyItemsPage");
    renderWithProviders(<MyItemsPage />, { initialPath: "/my-items?type=drawings&state=available" });
    const { from } = expectDefaultDateInputs();
    await user.clear(from);
    await user.type(from, "2026-01-01");
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expectDefaultDateInputs();
  });

  it("Clear resets reservations tab to default 30-day window", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { MyItemsPage } = await import("../../features/myitems/MyItemsPage");
    renderWithProviders(<MyItemsPage />);
    const { from } = expectDefaultDateInputs();
    await user.clear(from);
    await user.type(from, "2026-01-01");
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expectDefaultDateInputs();
  });
});

// ─── Search ──────────────────────────────────────────────────────────────────

const searchCalls: unknown[] = [];

vi.mock("../../features/search/useSearchDocuments", () => ({
  fetchSearchDocuments: vi.fn(async (...args: unknown[]) => {
    searchCalls.push(args);
    return { rows: [], totalCount: 0 };
  }),
}));

vi.mock("../../features/reserve/hooks/useReferenceData", () => ({
  useReferenceData: () => ({ data: { businesses: [], assets: [], units: [], domains: [], systems: [], kinds: [] } }),
}));

describe("Search grid filters", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
    searchCalls.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("fetches on load with default 30-day range", async () => {
    const { SearchPage } = await import("../../features/search/SearchPage");
    renderWithProviders(<SearchPage />);
    expectDefaultDateInputs();
    await waitFor(() => expect(searchCalls.length).toBeGreaterThan(0));
    const applied = searchCalls[0]?.[1] as { from: string; to: string };
    expect(applied.from).toBe(isoDateDaysAgo(30, FIXED_NOW));
    expect(applied.to).toBe(isoDateToday(FIXED_NOW));
  });

  it("Clear resets to default 30-day range", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { SearchPage } = await import("../../features/search/SearchPage");
    renderWithProviders(<SearchPage />);
    const { from } = expectDefaultDateInputs();
    await user.clear(from);
    await user.type(from, "2026-01-01");
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expectDefaultDateInputs();
  });
});

// ─── Approvals ───────────────────────────────────────────────────────────────

vi.mock("../../features/approvals/hooks/usePendingReservations", () => ({
  usePendingReservations: () => ({ data: [], isPending: false, isError: false }),
}));

vi.mock("../../features/approvals/hooks/useApproveReservation", () => ({
  useApproveReservation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("../../features/approvals/hooks/usePendingApprovals", () => ({
  usePendingApprovals: () => ({
    data: [],
    rows: [],
    isPending: false,
    isError: false,
    requestedCount: 0,
    awaitingValidationCount: 0,
  }),
}));

vi.mock("../../features/checkout/hooks/useApproveCheckout", () => ({
  useApproveCheckout: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("Approvals grid filters", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
    mockRole.value = "Admin";
  });
  afterEach(() => vi.useRealTimers());

  it("reservations section loads with default 30-day date inputs", async () => {
    const { ApprovalsPage } = await import("../../features/approvals/ApprovalsPage");
    renderWithProviders(<ApprovalsPage />);
    expectDefaultDateInputs();
  });

  it("documents section loads with default 30-day date inputs", async () => {
    const { ApprovalsPage } = await import("../../features/approvals/ApprovalsPage");
    renderWithProviders(<ApprovalsPage />, { initialPath: "/approvals?section=documents" });
    expectDefaultDateInputs();
  });
});

// ─── Broadcasts ──────────────────────────────────────────────────────────────

vi.mock("../../features/broadcasts/useBroadcasts", () => ({
  useBroadcasts: () => ({
    data: [{
      enmax_autocadbroadcastid: "bc-1",
      enmax_acdntitle: "Outage notice",
      enmax_acdnbody: "Planned work",
      enmax_acdnstartsat: "2026-06-20T08:00:00Z",
      enmax_acdnexpiresat: "2026-06-21T08:00:00Z",
      enmax_acdnseverity: 1,
      enmax_acdnaudience: 1,
      enmax_acdnpinned: false,
      enmax_acdnstatus: 1,
    }],
    isPending: false,
    isError: false,
  }),
  useSaveBroadcast: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../../features/broadcasts/BroadcastEditorDrawer", () => ({
  BroadcastEditorDrawer: () => null,
}));

describe("Broadcasts grid filters", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("loads with default 30-day range in filter inputs", async () => {
    const { BroadcastsPage } = await import("../../features/broadcasts/BroadcastsPage");
    renderWithProviders(<BroadcastsPage />);
    await waitFor(() => expect(screen.getByLabelText("From date")).toBeInTheDocument());
    expectDefaultDateInputs();
  });
});

// ─── Audit ───────────────────────────────────────────────────────────────────

vi.mock("../../generated", () => ({
  Enmax_autocadauditeventsService: {
    getAll: vi.fn().mockResolvedValue({ success: true, data: [] }),
  },
}));

describe("Audit grid filters", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it(`defaults to ${GRID_DEFAULT_FROM_DAYS}-day range (not 7 days)`, async () => {
    const { AuditPage } = await import("../../features/audit/AuditPage");
    renderWithProviders(<AuditPage />);
    expectDefaultDateInputs();
  });

  it("Clear resets date inputs to default 30-day window", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { AuditPage } = await import("../../features/audit/AuditPage");
    renderWithProviders(<AuditPage />);
    const { from } = expectDefaultDateInputs();
    await user.clear(from);
    await user.type(from, "2026-01-01");
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expectDefaultDateInputs();
  });
});

// ─── Lookup grids (no date range) ────────────────────────────────────────────

const appConfigFetchSpy = vi.fn().mockResolvedValue({
  rows: [{ id: "1", key: "GridPageSize", value: "10", valueType: 2 }],
  totalCount: 1,
});

vi.mock("../../features/admin/useAppConfigAdmin", () => ({
  VALUE_TYPE_LABELS: { 1: "Boolean", 2: "Integer", 3: "String", 4: "JSON" },
  fetchAppConfigRows: (...args: unknown[]) => appConfigFetchSpy(...args),
  useUpsertConfigRow: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../../features/admin/AppConfigRowPanel", () => ({
  AppConfigRowPanel: () => null,
}));

describe("Lookup grid filters (no date range)", () => {
  it("App Config Query applies only the key search", async () => {
    const { AppConfigPage } = await import("../../features/admin/AppConfigPage");
    const user = userEvent.setup();
    renderWithProviders(<AppConfigPage />);
    expect(screen.queryByLabelText("From date")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Key"), "GridPage");
    await user.click(screen.getByRole("button", { name: /query/i }));
    await waitFor(() => expect(appConfigFetchSpy).toHaveBeenCalled());
    const params = appConfigFetchSpy.mock.calls.at(-1)?.[0] as { search: string };
    expect(params.search).toBe("GridPage");

    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect((screen.getByLabelText("Key") as HTMLInputElement).value).toBe("");
  });
});
