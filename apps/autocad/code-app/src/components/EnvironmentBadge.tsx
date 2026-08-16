import { Badge, makeStyles, tokens } from "@fluentui/react-components";
import { useAppConfig } from "../config/useAppConfig";
import { resolveEnvironmentBadgeLabel } from "../config/environmentBadge";

const useStyles = makeStyles({
  badge: {
    flexShrink: 0,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: "0.04em",
  },
});

/** Non-production environment chip; hidden when App Config is Production. */
export function EnvironmentBadge() {
  const { EnvironmentBadge: raw } = useAppConfig();
  const label = resolveEnvironmentBadgeLabel(raw);
  const styles = useStyles();
  if (!label) return null;

  return (
    <Badge
      appearance="filled"
      color="warning"
      size="medium"
      className={styles.badge}
      aria-label={`Environment: ${label}`}
      data-testid="environment-badge"
    >
      {label}
    </Badge>
  );
}
