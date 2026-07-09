import {
  Badge,
  Button,
  Link,
  Spinner,
  Text,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import {
  ArrowSquareUpRightRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  Document24Regular,
} from "@fluentui/react-icons";
import type { SearchDocumentRow } from "./useSearchDocuments";
import { sharePointUrlFrom } from "../../components/DataGrid";

const STATE_COLORS: Record<string, "success" | "warning" | "danger" | "informative" | "brand" | undefined> = {
  Available: "success",
  "Checked Out": "warning",
  "Awaiting Validation": "warning",
  "Pending Approval": "danger",
  Obsolete: "informative",
  Void: "danger",
  Finalized: "brand",
};

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    flex: 1,
    minHeight: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalXS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  scroll: {
    flex: 1,
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
  number: {
    fontFamily: "monospace",
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
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
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  actions: {
    flexShrink: 0,
    display: "flex",
    alignItems: "flex-start",
  },
  pager: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  empty: {
    padding: tokens.spacingVerticalXXL,
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
});

interface Props {
  rows: SearchDocumentRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  isLoading?: boolean;
  hasQueried: boolean;
  emptyMessage: string;
  onPageChange: (page: number) => void;
  onRowClick: (row: SearchDocumentRow) => void;
}

export function SearchResultsList({
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
      <div className={styles.header}>
        <Text weight="semibold" size={300}>
          {hasQueried
            ? (totalCount === 0 ? "No results" : `${totalCount} result${totalCount === 1 ? "" : "s"}`)
            : "Enter filters and click Query"}
        </Text>
        {hasQueried && totalCount > 0 && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Showing {from}–{to}
          </Text>
        )}
      </div>

      {isLoading && (
        <div style={{ display: "flex", justifyContent: "center", padding: tokens.spacingVerticalL }}>
          <Spinner label="Searching…" />
        </div>
      )}

      {!isLoading && (
        <div className={styles.scroll}>
          {!hasQueried && (
            <div className={styles.empty}>
              <Text>Search by issued number or numbering group, then click Query to see individual documents.</Text>
            </div>
          )}
          {hasQueried && rows.length === 0 && (
            <div className={styles.empty}>
              <Text>{emptyMessage}</Text>
            </div>
          )}
          {rows.map((row) => {
            const spUrl = sharePointUrlFrom(row.sharePointUrl, row.destinationUrl);
            const stateColor = STATE_COLORS[row.stateLabel] ?? "informative";
            return (
              <button
                key={row.id}
                type="button"
                className={styles.card}
                onClick={() => onRowClick(row)}
              >
                <Document24Regular className={styles.icon} aria-hidden />
                <div className={styles.body}>
                  <div className={styles.titleRow}>
                    <Text className={styles.number}>{row.documentNumber}</Text>
                    <Badge appearance="tint" color="informative" size="small">{row.typeLabel}</Badge>
                    <Badge appearance="tint" color={stateColor} size="small">{row.stateLabel}</Badge>
                  </div>
                  <Text className={styles.subtitle} title={row.filename || row.title}>
                    {row.filename || row.title || "—"}
                  </Text>
                  <Text className={styles.meta} title={row.compositionSummary}>
                    {row.compositionSummary}
                    {row.currentRevision ? ` · Rev ${row.currentRevision}` : ""}
                  </Text>
                </div>
                {spUrl && (
                  <div className={styles.actions}>
                    <Link
                      href={spUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Open in SharePoint"
                    >
                      <ArrowSquareUpRightRegular />
                    </Link>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {hasQueried && totalCount > pageSize && (
        <div className={styles.pager}>
          <Button
            appearance="subtle"
            icon={<ChevronLeftRegular />}
            disabled={page <= 0 || isLoading}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <Text size={200}>Page {page + 1} of {totalPages}</Text>
          <Button
            appearance="subtle"
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
  );
}
