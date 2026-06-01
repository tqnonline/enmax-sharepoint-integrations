import { useMemo } from "react";
import { Button, Text, Spinner, tokens, makeStyles, mergeClasses } from "@fluentui/react-components";
import {
  Info16Filled, Warning16Filled, ErrorCircle16Filled, CheckmarkCircle16Filled, Dismiss16Regular,
  type FluentIcon,
} from "@fluentui/react-icons";
import { broadcastSeverityIntent, relativeTime, type SeverityIntent } from "../features/home/homeUtils";
import { groupFeed, GROUP_LABEL } from "./notificationUtils";
import type { NotificationItem } from "./useNotificationFeed";

const SEV_ICON: Record<SeverityIntent, FluentIcon> = {
  info: Info16Filled, warning: Warning16Filled, error: ErrorCircle16Filled, success: CheckmarkCircle16Filled,
};
const SEV_COLOR: Record<SeverityIntent, string> = {
  info: tokens.colorNeutralForeground3,
  warning: tokens.colorStatusWarningForeground1,
  error: tokens.colorStatusDangerForeground1,
  success: tokens.colorStatusSuccessForeground1,
};

const useStyles = makeStyles({
  groupLabel: {
    display: "block", color: tokens.colorNeutralForeground3,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    textTransform: "uppercase", letterSpacing: "0.04em",
  },
  item: {
    display: "flex", gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    ":hover": { backgroundColor: tokens.colorSubtleBackgroundHover },
  },
  itemUnread: { backgroundColor: tokens.colorNeutralBackground2 },
  icon: { flexShrink: 0, marginTop: "3px", fontSize: "16px", display: "flex" },
  body: { flexGrow: 1, minWidth: 0, cursor: "pointer" },
  titleRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  unreadDot: {
    width: "8px", height: "8px", flexShrink: 0, borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandForeground1,
  },
  title: {
    minWidth: 0, color: tokens.colorNeutralForeground1,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  titleFull: { whiteSpace: "normal", overflow: "visible", textOverflow: "clip" },
  textClamp: {
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
    color: tokens.colorNeutralForeground2,
  },
  textFull: { display: "block", whiteSpace: "pre-wrap", color: tokens.colorNeutralForeground2 },
  time: { display: "block", color: tokens.colorNeutralForeground3, marginTop: "2px" },
  actions: { flexShrink: 0, display: "flex", alignItems: "flex-start" },
  empty: {
    color: tokens.colorNeutralForeground3, textAlign: "center",
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalM}`,
  },
  center: { display: "flex", justifyContent: "center", padding: tokens.spacingVerticalL },
});

interface Props {
  notifications: NotificationItem[];
  loading: boolean;
  onOpen: (item: NotificationItem) => void;
  onMarkRead: (id: string) => void;
  /** compact = bell popover (truncated body); full = page (wrapped body). */
  compact?: boolean;
}

/** Grouped notification rows (Today / Earlier this week / Older) shared by the bell panel and the page. */
export function NotificationList({ notifications, loading, onOpen, onMarkRead, compact = false }: Props) {
  const styles = useStyles();
  const groups = useMemo(() => groupFeed(notifications, Date.now()), [notifications]);

  if (loading) return <div className={styles.center}><Spinner size="tiny" label="Loading…" /></div>;
  if (groups.length === 0) return <Text className={styles.empty}>You're all caught up.</Text>;

  return (
    <>
      {groups.map((g) => (
        <div key={g.key}>
          <Text size={100} weight="semibold" className={styles.groupLabel}>{GROUP_LABEL[g.key]}</Text>
          {g.items.map((item) => {
            const intent = broadcastSeverityIntent(item.severity);
            const Icon = SEV_ICON[intent];
            const unread = !item.read;
            return (
              <div key={item.id} className={mergeClasses(styles.item, unread && styles.itemUnread)}>
                <span className={styles.icon} style={{ color: SEV_COLOR[intent] }}><Icon /></span>
                <div
                  className={styles.body}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(item)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item); } }}
                >
                  <div className={styles.titleRow}>
                    {unread && <span className={styles.unreadDot} aria-hidden />}
                    <Text size={300} weight={unread ? "semibold" : "regular"}
                      className={mergeClasses(styles.title, !compact && styles.titleFull)}>
                      {item.title}
                    </Text>
                  </div>
                  {item.body && (
                    <Text size={200} className={compact ? styles.textClamp : styles.textFull}>{item.body}</Text>
                  )}
                  <Text size={100} className={styles.time} title={item.createdOn}>{relativeTime(item.createdOn)}</Text>
                </div>
                <div className={styles.actions}>
                  {unread && (
                    <Button size="small" appearance="subtle" icon={<Dismiss16Regular />} aria-label="Mark as read"
                      onClick={() => onMarkRead(item.id)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
