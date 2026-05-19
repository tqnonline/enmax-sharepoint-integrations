import { useState } from "react";
import {
  Button,
  Popover,
  PopoverTrigger,
  PopoverSurface,
  Text,
  makeStyles,
  tokens,
  Badge,
} from "@fluentui/react-components";
import { Alert24Regular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  panel: {
    width: "360px",
    padding: tokens.spacingVerticalM,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  empty: {
    color: tokens.colorNeutralForeground3,
    textAlign: "center",
    padding: tokens.spacingVerticalL,
  },
  triggerWrapper: { position: "relative", display: "inline-flex" },
  badge: { position: "absolute", top: "2px", right: "2px", pointerEvents: "none" },
});

export function NotificationBell() {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  // Real feed query lands in plan #08. Badge count fixed at 0 in this plan.
  const unreadCount = 0;

  return (
    <div className={styles.triggerWrapper}>
      <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} trapFocus>
        <PopoverTrigger disableButtonEnhancement>
          <Button
            appearance="subtle"
            icon={<Alert24Regular />}
            aria-label={
              unreadCount > 0
                ? `${unreadCount} unread notifications`
                : "Notifications"
            }
          />
        </PopoverTrigger>
        <PopoverSurface>
          <div className={styles.panel}>
            <Text weight="semibold">Notifications</Text>
            <Text className={styles.empty}>No notifications</Text>
          </div>
        </PopoverSurface>
      </Popover>
      {unreadCount > 0 && (
        <Badge
          className={styles.badge}
          color="danger"
          size="small"
          aria-hidden
        >
          {unreadCount}
        </Badge>
      )}
    </div>
  );
}
