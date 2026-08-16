import { Text, Badge, tokens, makeStyles } from "@fluentui/react-components";
import { DashboardCard } from "./DashboardCard";
import type { SequenceHealth } from "./useHomeData";

type BadgeColor = "warning" | "danger" | "subtle";
const SEQ_BADGE: Record<number, { label: string; color: BadgeColor }> = {
  2: { label: "Warning", color: "warning" },
  3: { label: "Critical", color: "danger" },
  4: { label: "Exhausted", color: "danger" },
};

const useStyles = makeStyles({
  row: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalXS} 0` },
  key: { fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  meta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100, whiteSpace: "nowrap" },
});

export function SystemHealthCard({ sequences, loading }: { sequences: SequenceHealth[]; loading: boolean }) {
  const styles = useStyles();
  return (
    <DashboardCard
      title="Number sequence health"
      count={sequences.length}
      countColor="danger"
      viewAllTo="/reference-data"
      viewAllLabel="Reference data"
      isLoading={loading}
      isEmpty={sequences.length === 0}
      emptyText="All number sequences are healthy."
    >
      {sequences.slice(0, 6).map((s) => {
        const badge = SEQ_BADGE[s.status] ?? { label: String(s.status), color: "subtle" as BadgeColor };
        return (
          <div key={s.key} className={styles.row}>
            <Text className={styles.key} title={s.key}>{s.key || "—"}</Text>
            <Text className={styles.meta}>{s.lastIssued}/9999</Text>
            <Badge appearance="tint" color={badge.color} shape="rounded">{badge.label}</Badge>
          </div>
        );
      })}
    </DashboardCard>
  );
}
