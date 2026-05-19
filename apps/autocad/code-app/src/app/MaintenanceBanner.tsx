import { MessageBar, MessageBarBody, MessageBarTitle } from "@fluentui/react-components";
import { useAppConfig } from "../config/useAppConfig";

const SEVERITY_MAP = {
  Info:     "info",
  Warning:  "warning",
  Critical: "error",
} as const;

export function MaintenanceBanner() {
  const config = useAppConfig();
  if (!config.SingleAdminMode) return null;

  return (
    <MessageBar
      intent={SEVERITY_MAP[config.MaintenanceBannerSeverity]}
      layout="multiline"
      politeness="polite"
    >
      <MessageBarBody>
        <MessageBarTitle>{config.MaintenanceBannerTitle}</MessageBarTitle>
        {config.MaintenanceBannerBody}
      </MessageBarBody>
    </MessageBar>
  );
}
