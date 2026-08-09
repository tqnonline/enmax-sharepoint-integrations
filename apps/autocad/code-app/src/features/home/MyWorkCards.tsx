import { useNavigate } from "react-router-dom";
import { Text, Badge, tokens, makeStyles } from "@fluentui/react-components";
import { DashboardCard } from "./DashboardCard";
import { relativeTime } from "./homeUtils";
import type { MyCheckout } from "../myitems/useMyCheckouts";
import type { MyReservation } from "../myitems/useMyReservations";
import { useCompositionLookups, type CompositionMaps } from "../approvals/hooks/useCompositionLookups";
import { formatReservationDisplay } from "../approvals/compositionUtils";
import { DocumentTypeBadge } from "../../components/DocumentTypeBadge";

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
    alignItems: "flex-start",
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
  body: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" },
  num: {
    fontFamily: "monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  detail: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badge: { flexShrink: 0, marginTop: "2px" },
  meta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    whiteSpace: "nowrap",
    minWidth: "56px",
    textAlign: "right",
    flexShrink: 0,
    marginTop: "2px",
  },
});

function reservationCodingLabel(r: MyReservation, maps?: CompositionMaps): string {
  const display = formatReservationDisplay({
    businessCode: maps?.bizMap.get(r.businessId ?? ""),
    assetCode:    maps?.assetMap.get(r.assetId ?? ""),
    unitCode:     maps?.unitMap.get(r.unitId ?? ""),
    domainCode:   maps?.domainMap.get(r.domainId ?? ""),
    systemCode:   maps?.sysMap.get(r.systemId ?? ""),
    kindCode:     maps?.kindMap.get(r.kindId ?? ""),
    enmax_acdnissuednumbers: r.issuedNumbers ?? "",
    sequenceType: r.sequenceType,
    targetDrawingId: r.targetDrawingId,
    targetDrawingNumber: r.targetDrawingNumber,
    appendFirst: r.appendFirst,
    appendLast: r.appendLast,
  });
  // Never fall back to RES-#### — coding sequence is the user-facing identity.
  return display;
}

interface Props {
  checkouts: MyCheckout[];
  checkoutsLoading: boolean;
  reservations: MyReservation[];
  reservationsLoading: boolean;
}

export function MyWorkCards({ checkouts, checkoutsLoading, reservations, reservationsLoading }: Props) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data: compMaps } = useCompositionLookups();
  const topCheckouts = checkouts.slice(0, 5);
  const topReservations = reservations.slice(0, 5);

  return (
    <div className={styles.grid}>
      <DashboardCard
        title="My Document/Drawing Number Reservations"
        count={reservations.length}
        countColor="informative"
        viewAllTo="/my-items?type=drawings&state=reservations"
        isLoading={reservationsLoading}
        isEmpty={topReservations.length === 0}
        emptyText="No active reservations. Reserve a Drawing Number or Document to get started."
      >
        {topReservations.map((r) => {
          const badge = RES_BADGE[r.status] ?? { label: r.statusLabel, color: "subtle" as BadgeColor };
          const coding = reservationCodingLabel(r, compMaps);
          const forWhom = r.submitterDisplay ? `Reserved for ${r.submitterDisplay}` : null;
          return (
            <div key={r.id} className={styles.row} onClick={() => navigate(`/reservations/${r.id}`)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") navigate(`/reservations/${r.id}`); }}>
              <div className={styles.body}>
                <Text className={styles.num} title={coding}>{coding || "—"}</Text>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                  <DocumentTypeBadge label={r.typeLabel} />
                  {forWhom && <Text className={styles.detail}>{forWhom}</Text>}
                </div>
              </div>
              <Badge className={styles.badge} appearance="tint" color={badge.color} shape="rounded">{badge.label}</Badge>
              {r.createdOn && <Text className={styles.meta}>{relativeTime(r.createdOn)}</Text>}
            </div>
          );
        })}
      </DashboardCard>

      <DashboardCard
        title="My Checked out Drawings/Documents"
        count={checkouts.length}
        countColor="important"
        viewAllTo="/my-items?type=drawings&state=checkedout"
        isLoading={checkoutsLoading}
        isEmpty={topCheckouts.length === 0}
        emptyText="No open Check Outs. Reserve and Check Out a drawing to start working."
      >
        {topCheckouts.map((c) => {
          const badge = CHK_BADGE[c.status] ?? { label: c.statusLabel, color: "subtle" as BadgeColor };
          const forWhom = c.checkedOutByName ? `Checked out for ${c.checkedOutByName}` : null;
          return (
            <div key={c.checkoutId} className={styles.row} onClick={() => navigate("/my-items?type=drawings&state=checkedout")} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") navigate("/my-items?type=drawings&state=checkedout"); }}>
              <div className={styles.body}>
                <Text className={styles.num} title={c.drawingNumber}>{c.drawingNumber || "—"}</Text>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                  <DocumentTypeBadge label={c.typeLabel} />
                  {forWhom && <Text className={styles.detail}>{forWhom}</Text>}
                </div>
              </div>
              <Badge className={styles.badge} appearance="tint" color={badge.color} shape="rounded">{badge.label}</Badge>
              {c.checkedOutOn && <Text className={styles.meta}>{relativeTime(c.checkedOutOn)}</Text>}
            </div>
          );
        })}
      </DashboardCard>
    </div>
  );
}
