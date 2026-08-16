import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  themeOverride: "light" | "dark" | "system" | null;  // null = use AppConfig.DefaultTheme
  viewAsEndUser: boolean;                               // session-only; Admin sees end-user perspective
  toggleSidebar: () => void;
  setThemeOverride: (t: UiState["themeOverride"]) => void;
  setViewAsEndUser: (v: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      themeOverride: null,
      viewAsEndUser: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setThemeOverride: (t) => set({ themeOverride: t }),
      setViewAsEndUser: (v) => set({ viewAsEndUser: v }),
    }),
    {
      name: "enmax-autocad-ui",
      partialize: s => ({ sidebarCollapsed: s.sidebarCollapsed, themeOverride: s.themeOverride }),
    },
  ),
);
