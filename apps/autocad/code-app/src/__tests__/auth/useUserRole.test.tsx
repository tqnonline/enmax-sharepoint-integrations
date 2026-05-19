import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUserRole } from "../../auth/useUserRole";

vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => ({
    AdminTeamId:    "7e7f5cf0-2153-f111-bec7-00224802e55b",
    ApproverTeamId: "00000000-0000-f000-0000-000000000002",
    UserTeamId:     "7de104bc-2153-f111-bec7-00224802e55b",
  }),
}));

vi.mock("@microsoft/power-apps/app", () => ({
  getContext: async () => ({
    user: { objectId: "azure-oid-0001", userPrincipalName: "testuser@enmax.com", fullName: "Test User" },
    host: { sessionId: "sess-0001" },
    app: { appId: "app-0001", appSettings: {}, environmentId: "env-0001", queryParams: {} },
  }),
}));

vi.mock("../../generated/services/WhoAmIService", () => ({
  WhoAmIService: { WhoAmI: vi.fn() },
}));

vi.mock("../../generated/services/TeamsService", () => ({
  TeamsService: { getAll: vi.fn() },
}));

vi.mock("../../generated/services/SystemusersService", () => ({
  SystemusersService: { getAll: vi.fn() },
}));

import { WhoAmIService } from "../../generated/services/WhoAmIService";
import { TeamsService } from "../../generated/services/TeamsService";
import { SystemusersService } from "../../generated/services/SystemusersService";
const mockWhoAmI   = vi.mocked(WhoAmIService.WhoAmI);
const mockTeamsAll = vi.mocked(TeamsService.getAll);
const mockSysAll   = vi.mocked(SystemusersService.getAll);

const WHO_AM_I_OK = { success: true, data: { UserId: "user-guid-0001" } };
const EMPTY_OK    = { success: true, data: [] };

const TEAM_IDS = {
  ADMIN:    "7e7f5cf0-2153-f111-bec7-00224802e55b",
  APPROVER: "00000000-0000-f000-0000-000000000002",
  USER:     "7de104bc-2153-f111-bec7-00224802e55b",
};

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => { vi.clearAllMocks(); });

// Test 6 — Admin team membership → Admin
test("returns Admin when user belongs to admin team (by teamid)", async () => {
  mockWhoAmI.mockResolvedValue(WHO_AM_I_OK as never);
  mockTeamsAll.mockResolvedValue({ success: true, data: [{ teamid: TEAM_IDS.ADMIN }] } as never);
  mockSysAll.mockResolvedValue(EMPTY_OK as never);
  const { result } = renderHook(() => useUserRole(), { wrapper: makeWrapper(freshClient()) });
  await waitFor(() => expect(result.current.role).toBe("Admin"));
});

// Test 7 — User team membership → User
test("returns User when user belongs to user team (by teamid)", async () => {
  mockWhoAmI.mockResolvedValue(WHO_AM_I_OK as never);
  mockTeamsAll.mockResolvedValue({ success: true, data: [{ teamid: TEAM_IDS.USER }] } as never);
  mockSysAll.mockResolvedValue(EMPTY_OK as never);
  const { result } = renderHook(() => useUserRole(), { wrapper: makeWrapper(freshClient()) });
  await waitFor(() => expect(result.current.role).toBe("User"));
});

// Test 8 — Approver team membership → Approver
test("returns Approver when user belongs to approver team (by teamid)", async () => {
  mockWhoAmI.mockResolvedValue(WHO_AM_I_OK as never);
  mockTeamsAll.mockResolvedValue({ success: true, data: [{ teamid: TEAM_IDS.APPROVER }] } as never);
  mockSysAll.mockResolvedValue(EMPTY_OK as never);
  const { result } = renderHook(() => useUserRole(), { wrapper: makeWrapper(freshClient()) });
  await waitFor(() => expect(result.current.role).toBe("Approver"));
});

// Test 9 — System Administrator or System Customizer → Admin regardless of team membership
test("returns Admin when user has System Administrator role even without admin team", async () => {
  mockWhoAmI.mockResolvedValue(WHO_AM_I_OK as never);
  mockTeamsAll.mockResolvedValue(EMPTY_OK as never);
  mockSysAll.mockResolvedValue({ success: true, data: [{ systemuserid: "user-guid-0001" }] } as never);
  const { result } = renderHook(() => useUserRole(), { wrapper: makeWrapper(freshClient()) });
  await waitFor(() => expect(result.current.role).toBe("Admin"));
});

// Test 10 — Both queries fail → must not grant elevated role (fail-closed)
test("returns Unknown when both queries fail — must not grant elevated role", async () => {
  mockWhoAmI.mockResolvedValue(WHO_AM_I_OK as never);
  mockTeamsAll.mockRejectedValue(new Error("network error"));
  mockSysAll.mockRejectedValue(new Error("network error"));
  const { result } = renderHook(() => useUserRole(), { wrapper: makeWrapper(freshClient()) });
  await waitFor(() => expect(result.current.role).toBe("Unknown"), { timeout: 2000 });
});

// Test 11 — Sys role check fails but team check succeeds → still resolve from teams
test("resolves role from team membership when sys-role query fails", async () => {
  mockWhoAmI.mockResolvedValue(WHO_AM_I_OK as never);
  mockTeamsAll.mockResolvedValue({ success: true, data: [{ teamid: TEAM_IDS.ADMIN }] } as never);
  mockSysAll.mockRejectedValue(new Error("network error"));
  const { result } = renderHook(() => useUserRole(), { wrapper: makeWrapper(freshClient()) });
  await waitFor(() => expect(result.current.role).toBe("Admin"));
});

// Test 12 — No teams, no elevated roles → Unknown
test("returns Unknown when user has no team membership and no system roles", async () => {
  mockWhoAmI.mockResolvedValue(WHO_AM_I_OK as never);
  mockTeamsAll.mockResolvedValue(EMPTY_OK as never);
  mockSysAll.mockResolvedValue(EMPTY_OK as never);
  const { result } = renderHook(() => useUserRole(), { wrapper: makeWrapper(freshClient()) });
  await waitFor(() => expect(result.current.role).toBe("Unknown"));
});
