import { useNavigate } from "react-router-dom";
import { Title2, Text, Button, tokens, makeStyles } from "@fluentui/react-components";
import { CheckmarkRegular } from "@fluentui/react-icons";
import { useCurrentUser } from "../../auth/useCurrentUser";
import {
  useNotificationFeed, useMarkNotificationRead, useMarkAllNotificationsRead, type NotificationItem,
} from "../../app/useNotificationFeed";
import { NotificationList } from "../../app/NotificationList";

const PAGE_LIMIT = 200;
const FADE_UP = { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } };

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  header: {
    paddingLeft: tokens.spacingHorizontalL, borderLeftWidth: "4px", borderLeftStyle: "solid",
    borderLeftColor: tokens.colorBrandForeground1,
    animationName: FADE_UP, animationDuration: "200ms", animationFillMode: "both",
  },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXS, display: "block" },
  toolbar: { display: "flex" },
  content: {
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: "hidden",
    animationName: FADE_UP, animationDuration: "150ms", animationFillMode: "both",
  },
});

export function NotificationsPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const userId = user?.id;

  const feedQ = useNotificationFeed(userId, PAGE_LIMIT);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead(userId, PAGE_LIMIT);

  const notifications = feedQ.data ?? [];
  const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);

  function openItem(item: NotificationItem) {
    if (!item.read) markRead.mutate(item.id);
    if (item.deepLinkPath) navigate(item.deepLinkPath);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Title2 as="h1">Notifications</Title2>
        <Text size={300} className={styles.subtitle}>
          Everything we've sent you, newest first.
        </Text>
      </div>

      <div className={styles.toolbar}>
        {unreadIds.length > 0 && (
          <Button appearance="primary" icon={<CheckmarkRegular />} disabled={markAll.isPending}
            onClick={() => markAll.mutate(unreadIds)}>
            Mark all read
          </Button>
        )}
      </div>

      <div className={styles.content}>
        <NotificationList
          notifications={notifications}
          loading={feedQ.isPending}
          error={feedQ.isError}
          onOpen={openItem}
          onMarkRead={markRead.mutate}
        />
      </div>
    </div>
  );
}
