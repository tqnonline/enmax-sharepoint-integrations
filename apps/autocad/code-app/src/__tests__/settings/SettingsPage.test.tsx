import { screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { SettingsPage } from "../../features/settings/SettingsPage";
import type { Role } from "../../auth/useUserRole";
import { useUiStore } from "../../store/uiStore";

const mockRole: { value: Role } = { value: "Admin" };
const mockConfig = {
  SingleAdminMode:  false,
  FooterDisclaimer: "For internal use only",
  FooterCopyright:  "© 2026 ENMAX",
  DefaultTheme:     "system" as const,
};

vi.mock("../../auth/useUserRole", () => ({
  useUserRole: () => ({ role: mockRole.value, isPending: false }),
}));

vi.mock("../../auth/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: { id: "usr-001", name: "Test User" }, isPending: false }),
}));

vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => mockConfig,
}));

const mockSaveMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock("../../features/settings/useUserPreferences", () => ({
  useUserPreferences:     () => ({ data: { id: null, emailEnabled: true, teamsEnabled: true }, isPending: false }),
  useSaveUserPreferences: () => ({ mutateAsync: mockSaveMutateAsync, isPending: false }),
}));

vi.mock("../../generated", async () => ({
  ...(await vi.importActual<object>("../../generated")),
  Enmax_autocadappconfigsService: {
    getAll:   vi.fn().mockResolvedValue({ success: true, data: [{ enmax_autocadappconfigid: "cfg-001" }] }),
    update:   vi.fn().mockResolvedValue({ success: true }),
    create:   vi.fn().mockResolvedValue({ success: true }),
  },
}));

beforeEach(() => {
  mockRole.value = "Admin";
  mockConfig.SingleAdminMode = false;
  act(() => { useUiStore.setState({ viewAsEndUser: false, themeOverride: null }); });
});

afterEach(() => { vi.clearAllMocks(); });

// Test 31 — Theme dropdown changes uiStore
test("changing theme dropdown updates uiStore.themeOverride", async () => {
  const user = userEvent.setup();
  renderWithProviders(<SettingsPage />);
  // Fluent UI Select renders an outer wrapper + native select; use role=combobox
  const select = screen.getByRole("combobox", { name: /theme/i }) as HTMLSelectElement;
  await user.selectOptions(select, "dark");
  expect(useUiStore.getState().themeOverride).toBe("dark");
});

// Test 32 — Notification preferences persist to Dataverse (via mutation)
test("toggling email notifications calls save mutation", async () => {
  const user = userEvent.setup();
  renderWithProviders(<SettingsPage />);
  await user.click(screen.getByRole("switch", { name: /email notifications/i }));
  expect(mockSaveMutateAsync).toHaveBeenCalled();
});

// Test 33 — Single Admin Mode toggle visible only to Admin
test("Single Admin Mode section not visible to non-Admin", () => {
  mockRole.value = "User";
  renderWithProviders(<SettingsPage />);
  expect(screen.queryByText("Single Admin Mode")).not.toBeInTheDocument();
});

// Test 34 — View as end user only visible when SingleAdminMode=true
test("View as end user toggle only visible when SingleAdminMode active", () => {
  mockConfig.SingleAdminMode = false;
  renderWithProviders(<SettingsPage />);
  expect(screen.queryByLabelText("View as end user")).not.toBeInTheDocument();
});

test("View as end user toggle visible when SingleAdminMode is active", () => {
  mockConfig.SingleAdminMode = true;
  renderWithProviders(<SettingsPage />);
  expect(screen.getByLabelText("View as end user")).toBeInTheDocument();
});

// Test 36 — Single Admin Mode button shows Disable when on
test("shows Disable when Single Admin Mode is on", () => {
  mockRole.value = "Admin";
  mockConfig.SingleAdminMode = true;
  renderWithProviders(<SettingsPage />);
  expect(screen.getByRole("button", { name: /disable single admin mode/i })).toBeEnabled();
});

// Test 37 — Single Admin Mode button shows Enable when off
test("shows Enable when Single Admin Mode is off", () => {
  mockRole.value = "Admin";
  mockConfig.SingleAdminMode = false;
  renderWithProviders(<SettingsPage />);
  expect(screen.getByRole("button", { name: /enable single admin mode/i })).toBeInTheDocument();
});

// Test 35 — useEffectiveRole returns User when viewAsEndUser=true and role is Admin
test("useEffectiveRole returns User when viewAsEndUser=true and real role is Admin", async () => {
  const { useEffectiveRole } = await import("../../auth/useEffectiveRole");
  act(() => { useUiStore.setState({ viewAsEndUser: true }); });
  const { renderHook } = await import("@testing-library/react");
  const { result } = renderHook(() => useEffectiveRole());
  expect(result.current.role).toBe("User");
});
