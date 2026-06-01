import { useNavigate } from "react-router-dom";
import { Text, Button, tokens, makeStyles } from "@fluentui/react-components";
import {
  CheckmarkCircle20Regular,
  ClipboardTaskListLtr20Regular,
  DocumentArrowUp20Regular,
  Clock20Regular,
} from "@fluentui/react-icons";
import type { MyCheckout } from "../myitems/useMyCheckouts";

const useStyles = makeStyles({
  panel: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  sectionLabel: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    textTransform: "uppercase",
    fontSize: tokens.fontSizeBase200,
    letterSpacing: "0.04em",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    borderLeftWidth: "3px",
    borderLeftStyle: "solid",
  },
  urgent: { borderLeftColor: tokens.colorPaletteRedBorderActive, color: tokens.colorPaletteRedForeground1 },
  warn: { borderLeftColor: tokens.colorPaletteDarkOrangeBorderActive, color: tokens.colorPaletteDarkOrangeForeground1 },
  text: { flex: 1, color: tokens.colorNeutralForeground1 },
  num: { fontFamily: "monospace" },
  cta: { marginLeft: "auto" },
  clear: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    color: tokens.colorPaletteGreenForeground1,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXS}`,
  },
});

interface Props {
  isApproverOrAdmin: boolean;
  pendingApprovals: number;
  pendingCheckins: number;
  staleCheckouts: MyCheckout[];
}

export function AttentionPanel({ isApproverOrAdmin, pendingApprovals, pendingCheckins, staleCheckouts }: Props) {
  const styles = useStyles();
  const navigate = useNavigate();

  const hasApprovals = isApproverOrAdmin && pendingApprovals > 0;
  const hasCheckins = isApproverOrAdmin && pendingCheckins > 0;
  const stale = staleCheckouts.slice(0, 3);
  const nothing = !hasApprovals && !hasCheckins && stale.length === 0;

  return (
    <div className={styles.panel}>
      <Text className={styles.sectionLabel}>Needs your attention</Text>

      {nothing && (
        <div className={styles.clear}>
          <CheckmarkCircle20Regular />
          <Text>You&rsquo;re all caught up — nothing needs your attention right now.</Text>
        </div>
      )}

      {hasApprovals && (
        <div className={`${styles.row} ${styles.urgent}`}>
          <ClipboardTaskListLtr20Regular />
          <Text className={styles.text} weight="semibold">
            {pendingApprovals} reservation{pendingApprovals !== 1 ? "s" : ""} pending your approval
          </Text>
          <Button appearance="primary" size="small" className={styles.cta} onClick={() => navigate("/approvals?tab=pending")}>
            Review
          </Button>
        </div>
      )}

      {hasCheckins && (
        <div className={`${styles.row} ${styles.urgent}`}>
          <DocumentArrowUp20Regular />
          <Text className={styles.text} weight="semibold">
            {pendingCheckins} check-in{pendingCheckins !== 1 ? "s" : ""} to validate
          </Text>
          <Button appearance="primary" size="small" className={styles.cta} onClick={() => navigate("/approvals?tab=checkins")}>
            Validate
          </Button>
        </div>
      )}

      {stale.map((c) => (
        <div key={c.checkoutId} className={`${styles.row} ${styles.warn}`}>
          <Clock20Regular />
          <Text className={styles.text}>
            Stale check-out · <span className={styles.num}>{c.drawingNumber || "drawing"}</span> out {c.daysOut} day{c.daysOut !== 1 ? "s" : ""}
          </Text>
          <Button appearance="secondary" size="small" className={styles.cta} onClick={() => navigate("/my-items?tab=checkouts")}>
            Open
          </Button>
        </div>
      ))}
    </div>
  );
}
