import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardHeader,
  Text,
  Badge,
  Skeleton,
  SkeletonItem,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { ArrowRight16Regular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  card: { height: "100%" },
  headerRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, width: "100%" },
  title: { fontWeight: tokens.fontWeightSemibold },
  viewAll: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
    color: tokens.colorBrandForeground1,
    textDecorationLine: "none",
    fontSize: tokens.fontSizeBase200,
  },
  body: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS },
  empty: {
    color: tokens.colorNeutralForeground3,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
  skeletonRow: { display: "flex", gap: tokens.spacingHorizontalS, paddingTop: tokens.spacingVerticalXS },
});

interface Props {
  title: string;
  count?: number;
  countColor?: "brand" | "danger" | "important" | "informative" | "subtle";
  viewAllTo?: string;
  viewAllLabel?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyText?: string;
  children?: ReactNode;
}

export function DashboardCard({
  title, count, countColor = "subtle", viewAllTo, viewAllLabel = "View all",
  isLoading, isEmpty, emptyText = "Nothing here yet.", children,
}: Props) {
  const styles = useStyles();
  return (
    <Card className={styles.card} appearance="filled-alternative">
      <CardHeader
        header={
          <div className={styles.headerRow}>
            <Text className={styles.title}>{title}</Text>
            {typeof count === "number" && count > 0 && (
              <Badge appearance="tint" color={countColor === "subtle" ? "informative" : countColor} shape="rounded">
                {count}
              </Badge>
            )}
            {viewAllTo && (
              <Link to={viewAllTo} className={styles.viewAll}>
                {viewAllLabel}
                <ArrowRight16Regular />
              </Link>
            )}
          </div>
        }
      />
      {isLoading ? (
        <Skeleton aria-label="Loading">
          <div className={styles.skeletonRow}><SkeletonItem /></div>
          <div className={styles.skeletonRow}><SkeletonItem /></div>
          <div className={styles.skeletonRow}><SkeletonItem /></div>
        </Skeleton>
      ) : isEmpty ? (
        <Text size={200} className={styles.empty}>{emptyText}</Text>
      ) : (
        <div className={styles.body}>{children}</div>
      )}
    </Card>
  );
}
