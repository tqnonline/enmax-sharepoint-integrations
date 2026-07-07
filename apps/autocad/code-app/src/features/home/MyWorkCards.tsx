import { useNavigate } from "react-router-dom";
import { Text, Badge, tokens, makeStyles } from "@fluentui/react-components";
import { DashboardCard } from "./DashboardCard";
import { relativeTime } from "./homeUtils";
import type { MyCheckout } from "../myitems/useMyCheckouts";
import type { MyReservation } from "../myitems/useMyReservations";

type BadgeColor = "informative" | "success" | "warning" | "subtle" | "danger";

const RES_BADGE: Record<number, { label: string; color: BadgeColor }> = {
  1: { label: "Pending", color: "warning" },
  2: { label: "Approved", color: "success" },
  3: { label: "Declined", color: "subtle" },
  4: { label: "Cancelled", color: "subtle" },
};

const CHK_BADGE: Record<number, { label: string; color: BadgeColor }> = {
  1: { label: "Checked Out", color: "warning" },
  2: { label: "Awaiting Validation", color: "informative" },
};

const useStyles = makeStyles({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: tokens.spacingHorizontalL,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    marginLeft: `calc(-1 * ${tokens.spacingHorizontalS})`,
    marginRight: `calc(-1 * ${tokens.spacingHorizontalS})`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  num: { fontFamily: "monospace", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  badge: { flexShrink: 0 },
  meta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100, whiteSpace: "nowrap", minWidth: "56px", textAlign: "right", flexShrink: 0 },
});

interface Props {
  checkouts: MyCheckout[];
  checkoutsLoading: boolean;
  reservations: MyReservation[];
  reservationsLoading: boolean;
}

export function MyWorkCards({ checkouts, checkoutsLoading, reservations, reservationsLoading }: Props) {
  const styles = useStyles();
  const navigate = useNavigate();
  const topCheckouts = checkouts.slice(0, 5);
  const topReservations = reservations.slice(0, 5);

  // Item 12: reservations card leads, checked-out drawings follows (positions swapped).
  return (
    <div className={styles.grid}>
      <DashboardCard
        title="My Document/Drawing Number Reservations"
        count={reservations.length}
        countColor="informative"
        viewAllTo="/my-items"
        isLoading={reservationsLoading}
        isEmpty={topReservations.length === 0}
        emptyText="No active reservations. Reserve a Drawing/Document Number to get started."
      >
        {topReservations.map((r) => {
          const badge = RES_BADGE[r.status] ?? { label: r.statusLabel, color: "subtle" as BadgeColor };
          return (
            <div key={r.id} className={styles.row} onClick={() => navigate(`/reservations/${r.id}`)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") navigate(`/reservations/${r.id}`); }}>
              <Text className={styles.num} title={r.reservationNumber}>{r.reservationNumber || "—"}</Text>
              <Badge className={styles.badge} appearance="tint" color={badge.color} shape="rounded">{badge.label}</Badge>
              {r.createdOn && <Text className={styles.meta}>{relativeTime(r.createdOn)}</Text>}
            </div>
          );
        })}
      </DashboardCard>

      <DashboardCard
        title="My Checked Out Drawings"
        count={checkouts.length}
        countColor="important"
        viewAllTo="/my-items?tab=checkouts"
        isLoading={checkoutsLoading}
        isEmpty={topCheckouts.length === 0}
        emptyText="No open Check Outs. Reserve and Check Out a drawing to start working."
      >
        {topCheckouts.map((c) => {
          const badge = CHK_BADGE[c.status] ?? { label: c.statusLabel, color: "subtle" as BadgeColor };
          return (
            <div key={c.checkoutId} className={styles.row} onClick={() => navigate("/my-items?tab=checkouts")} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") navigate("/my-items?tab=checkouts"); }}>
              <Text className={styles.num} title={c.drawingNumber}>{c.drawingNumber || "—"}</Text>
              <Badge className={styles.badge} appearance="tint" color={badge.color} shape="rounded">{badge.label}</Badge>
              {c.checkedOutOn && <Text className={styles.meta}>{relativeTime(c.checkedOutOn)}</Text>}
            </div>
          );
        })}
      </DashboardCard>
    </div>
  );
}
