import { useState } from "react";
import {
  Button, Popover, PopoverTrigger, PopoverSurface, makeStyles, Badge,
} from "@fluentui/react-components";
import { Alert24Regular } from "@fluentui/react-icons";
import { useCurrentUser } from "../auth/useCurrentUser";
import { useNotificationFeed } from "./useNotificationFeed";
import { feedUnreadCount, badgeLabel } from "./notificationUtils";
import { NotificationFeedPanel } from "./NotificationFeedPanel";

const useStyles = makeStyles({
  triggerWrapper: { position: "relative", display: "inline-flex" },
  badge: { position: "absolute", top: "2px", right: "2px", pointerEvents: "none" },
  surface: { padding: 0, overflow: "hidden" },
});

export function NotificationBell() {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const { data: user } = useCurrentUser();

  const feedQ = useNotificationFeed(user?.id);
  const unread = feedUnreadCount(feedQ.data ?? []);

  return (
    <div className={styles.triggerWrapper}>
      <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} trapFocus positioning="below-end">
        <PopoverTrigger disableButtonEnhancement>
          <Button
            appearance="subtle"
            icon={<Alert24Regular />}
            aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
          />
        </PopoverTrigger>
        <PopoverSurface className={styles.surface}>
          <NotificationFeedPanel onClose={() => setOpen(false)} />
        </PopoverSurface>
      </Popover>
      {unread > 0 && (
        <Badge className={styles.badge} color="danger" size="small" aria-hidden>
          {badgeLabel(unread)}
        </Badge>
      )}
    </div>
  );
}
