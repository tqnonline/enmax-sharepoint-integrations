import {
  Badge,
  Button,
  Spinner,
  Text,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import {
  CalendarLtr24Regular,
  ChevronLeftRegular,
  ChevronRightRegular,
} from "@fluentui/react-icons";
import type { ReservationRow } from "./useUnifiedSearch";
import { RESERVATION_STATUS } from "../myitems/useMyReservations";

const STATUS_COLORS: Record<string, "success" | "warning" | "danger" | "informative" | undefined> = {
  Pending: "warning",
  Approved: "success",
  Declined: "danger",
  Cancelled: "informative",
};

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    paddingRight: tokens.spacingHorizontalXS,
  },
  card: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      borderTopColor: tokens.colorBrandStroke1,
      borderRightColor: tokens.colorBrandStroke1,
      borderBottomColor: tokens.colorBrandStroke1,
      borderLeftColor: tokens.colorBrandStroke1,
    },
  },
  icon: {
    flexShrink: 0,
    color: tokens.colorBrandForeground1,
    marginTop: "2px",
  },
  body: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
  },
  titleRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  subtitle: {
    color: tokens.colorNeutralForeground2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  footer: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  footerMeta: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    minWidth: "180px",
  },
  pager: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    marginLeft: "auto",
  },
  empty: {
    padding: tokens.spacingVerticalXXL,
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
  loading: {
    display: "flex",
    justifyContent: "center",
    padding: tokens.spacingVerticalL,
  },
});

interface Props {
  rows: ReservationRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  isLoading?: boolean;
  hasQueried: boolean;
  emptyMessage: string;
  onPageChange: (page: number) => void;
  onRowClick: (row: ReservationRow) => void;
}

function matchingLabel(totalCount: number): string {
  if (totalCount === 0) return "No matching reservations";
  return `${totalCount} matching reservation${totalCount === 1 ? "" : "s"}`;
}

export function SearchReservationResultsList({
  rows,
  totalCount,
  page,
  pageSize,
  isLoading,
  hasQueried,
  emptyMessage,
  onPageChange,
  onRowClick,
}: Props) {
  const styles = useStyles();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = totalCount === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(totalCount, (page + 1) * pageSize);

  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        {!hasQueried && (
          <div className={styles.empty}>
            <Text>Search by reservation ID or reason, then click Query to see results.</Text>
          </div>
        )}
        {hasQueried && isLoading && rows.length === 0 && (
          <div className={styles.loading}>
            <Spinner label="Searching…" />
          </div>
        )}
        {hasQueried && !isLoading && rows.length === 0 && (
          <div className={styles.empty}>
            <Text>{emptyMessage}</Text>
          </div>
        )}
        {rows.map((row) => {
          const statusLabel = RESERVATION_STATUS[row.status] ?? String(row.status);
          const statusColor = STATUS_COLORS[statusLabel] ?? "informative";
          return (
            <button
              key={row.id}
              type="button"
              className={styles.card}
              onClick={() => onRowClick(row)}
            >
              <CalendarLtr24Regular className={styles.icon} aria-hidden />
              <div className={styles.body}>
                <div className={styles.titleRow}>
                  <Text weight="semibold" size={400}>{row.number}</Text>
                  <Badge appearance="tint" color={statusColor} size="small">{statusLabel}</Badge>
                </div>
                <Text className={styles.subtitle} title={row.reason}>
                  {row.reason || "—"}
                </Text>
                <Text className={styles.meta}>
                  {row.submittedByName ? `Submitted by ${row.submittedByName}` : "Reservation"}
                  {row.approvedByName ? ` · Approved by ${row.approvedByName}` : ""}
                </Text>
              </div>
            </button>
          );
        })}
      </div>

      {hasQueried && (
        <div className={styles.footer} aria-live="polite">
          <div className={styles.footerMeta}>
            <Text weight="semibold" size={300}>
              {isLoading ? "Searching…" : matchingLabel(totalCount)}
            </Text>
            {!isLoading && totalCount > 0 && (
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                Showing {from}–{to} of {totalCount}
              </Text>
            )}
          </div>
          {totalPages > 1 && (
            <div className={styles.pager}>
              <Button
                appearance="secondary"
                size="small"
                icon={<ChevronLeftRegular />}
                disabled={page <= 0 || isLoading}
                onClick={() => onPageChange(page - 1)}
              >
                Previous
              </Button>
              <Text size={200}>Page {page + 1} of {totalPages}</Text>
              <Button
                appearance="secondary"
                size="small"
                icon={<ChevronRightRegular />}
                iconPosition="after"
                disabled={page >= totalPages - 1 || isLoading}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
