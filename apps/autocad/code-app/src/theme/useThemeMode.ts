import { useState, useEffect, useMemo } from "react";
import { type Theme } from "@fluentui/react-components";
import { enmaxLightTheme, enmaxDarkTheme } from "./brand";
import { useUiStore } from "../store/uiStore";

type ThemeKey = "light" | "dark" | "system";

// Priority: uiStore.themeOverride ?? appConfigDefault ?? "system"
// appConfigDefault is passed in so this hook doesn't import useAppConfig
// (avoids circular dep: AppConfigGate → useAppConfig → useThemeMode).
export function useThemeMode(appConfigDefault: ThemeKey = "system"): Theme {
  const themeOverride = useUiStore((s) => s.themeOverride);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return useMemo(() => {
    const resolved = themeOverride ?? appConfigDefault;
    const effective = resolved === "system" ? (systemDark ? "dark" : "light") : resolved;
    return effective === "dark" ? enmaxDarkTheme : enmaxLightTheme;
  }, [themeOverride, appConfigDefault, systemDark]);
}
