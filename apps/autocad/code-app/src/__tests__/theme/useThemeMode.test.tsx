import { renderHook } from "@testing-library/react";
import { useThemeMode } from "../../theme/useThemeMode";
import { enmaxDarkTheme, enmaxLightTheme } from "../../theme/brand";
import { useUiStore } from "../../store/uiStore";

// Reset Zustand store between tests
beforeEach(() => {
  useUiStore.setState({ themeOverride: null, sidebarCollapsed: false });
});

// Simulate OS preference by mocking window.matchMedia
function setSystemTheme(theme: "light" | "dark") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && theme === "dark",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// Test 12 — When system preference is dark, theme must automatically be dark
test("returns dark theme when system prefers dark and no override set", () => {
  setSystemTheme("dark");
  const { result } = renderHook(() => useThemeMode("system"));
  expect(result.current).toEqual(enmaxDarkTheme);
});

// Test 13 — User's explicit override must win over system preference
test("returns light theme when themeOverride=light even if system prefers dark", () => {
  setSystemTheme("dark");
  useUiStore.setState({ themeOverride: "light" });
  const { result } = renderHook(() => useThemeMode("system"));
  expect(result.current).toEqual(enmaxLightTheme);
});
