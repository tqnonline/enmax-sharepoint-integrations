import { useState, useEffect, useMemo } from "react";
import { type Theme } from "@fluentui/react-components";
import { enmaxLightTheme, enmaxDarkTheme } from "./brand";
import { useUiStore } from "../store/uiStore";

type ThemeKey = "light" | "dark" | "system";

function applyDocumentColorScheme(mode: "light" | "dark") {
  const root = document.documentElement;
  root.style.colorScheme = mode;
  root.dataset.theme = mode;
}

function resolveEffectiveMode(
  themeOverride: ThemeKey | null,
  appConfigDefault: ThemeKey,
  systemDark: boolean,
): "light" | "dark" {
  const resolved = themeOverride ?? appConfigDefault;
  return resolved === "system" ? (systemDark ? "dark" : "light") : resolved;
}

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

  const effective = resolveEffectiveMode(themeOverride, appConfigDefault, systemDark);

  // Native <select>/<input> follow the document color-scheme. Without this,
  // Fluent dark theme leaves form controls with light-scheme charcoal text
  // on dark backgrounds (Search coding filters, Settings theme select, etc.).
  useEffect(() => {
    applyDocumentColorScheme(effective);
  }, [effective]);

  return useMemo(
    () => (effective === "dark" ? enmaxDarkTheme : enmaxLightTheme),
    [effective],
  );
}
