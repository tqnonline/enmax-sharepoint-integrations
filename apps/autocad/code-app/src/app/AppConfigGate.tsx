import { type ReactNode } from "react";
import { FluentProvider } from "@fluentui/react-components";
import { useAppConfig } from "../config/useAppConfig";
import { useThemeMode } from "../theme/useThemeMode";

interface AppConfigGateProps {
  children: ReactNode;
}

// Suspends until config is loaded (via useSuspenseQuery inside useAppConfig).
// Re-wraps FluentProvider with theme derived from AppConfig.DefaultTheme so the
// theme is config-driven, not hardcoded. ZodError from useAppConfig propagates
// to the Suspense error boundary — fail-loud per CLAUDE.md Rule 12.
export function AppConfigGate({ children }: AppConfigGateProps) {
  const config = useAppConfig();
  const theme = useThemeMode(config.DefaultTheme);

  return (
    <FluentProvider theme={theme} style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      {children}
    </FluentProvider>
  );
}
