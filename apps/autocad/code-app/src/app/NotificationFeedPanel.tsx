import { useNavigate } from "react-router-dom";
import { Button, Text, tokens, makeStyles } from "@fluentui/react-components";
import { CheckmarkRegular } from "@fluentui/react-icons";
import { useCurrentUser } from "../auth/useCurrentUser";
import { useNotificationFeed, useMarkNotificationRead, useMarkAllNotificationsRead, type NotificationItem } from "./useNotificationFeed";
import { NotificationList } from "./NotificationList";

const useStyles = makeStyles({
  panel: { width: "380px", display: "flex", flexDirection: "column", maxHeight: "70vh" },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottomWidth: tokens.strokeWidthThin, borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  scroll: { overflowY: "auto", padding: `${tokens.spacingVerticalXS} 0`, flexGrow: 1 },
  footer: {
    display: "flex", justifyContent: "center",
    padding: tokens.spacingVerticalXS,
    borderTopWidth: tokens.strokeWidthThin, borderTopStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2,
  },
});

export function NotificationFeedPanel({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();

  const feedQ = useNotificationFeed(user?.id);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead(user?.id);

  const notifications = feedQ.data ?? [];
  const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);

  function openItem(item: NotificationItem) {
    if (!item.read) markRead.mutate(item.id);
    navigate(item.deepLinkPath || "/");
    onClose();
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <Text weight="semibold">Notifications</Text>
        {unreadIds.length > 0 && (
          <Button
            size="small" appearance="subtle" icon={<CheckmarkRegular />}
            disabled={markAll.isPending}
            onClick={() => markAll.mutate(unreadIds)}
          >
            Mark all read
          </Button>
        )}
      </div>

      <div className={styles.scroll}>
        <NotificationList
          notifications={notifications}
          loading={feedQ.isPending}
          error={feedQ.isError}
          onOpen={openItem}
          onMarkRead={markRead.mutate}
          compact
        />
      </div>

      <div className={styles.footer}>
        <Button appearance="subtle" onClick={() => { navigate("/notifications"); onClose(); }}>
          See all notifications
        </Button>
      </div>
    </div>
  );
}
