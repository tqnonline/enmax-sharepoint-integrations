import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  themeOverride: "light" | "dark" | "system" | null;  // null = use AppConfig.DefaultTheme
  toggleSidebar: () => void;
  setThemeOverride: (t: UiState["themeOverride"]) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      themeOverride: null,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setThemeOverride: (t) => set({ themeOverride: t }),
    }),
    { name: "enmax-autocad-ui" },
  ),
);
