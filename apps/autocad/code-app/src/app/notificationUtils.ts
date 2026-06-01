import type { NotificationItem } from "./useNotificationFeed";

function ts(iso: string): number {
  const t = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

/** Unread badge count (notifications with read=false). */
export function feedUnreadCount(notifications: NotificationItem[]): number {
  return notifications.filter((n) => !n.read).length;
}

/** Bell badge label, clamped at 99+. */
export function badgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export type FeedGroupKey = "today" | "week" | "older";
export const GROUP_LABEL: Record<FeedGroupKey, string> = {
  today: "Today",
  week: "Earlier this week",
  older: "Older",
};

export function startOfDay(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfWeek(nowMs: number): number {
  const d = new Date(nowMs);
  const sinceMonday = (d.getDay() + 6) % 7; // Monday-based week start
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

/** Group notifications (already newest-first) into Today / Earlier this week / Older; empty groups dropped. */
export function groupFeed(
  items: NotificationItem[],
  nowMs: number,
): { key: FeedGroupKey; items: NotificationItem[] }[] {
  const sod = startOfDay(nowMs);
  const sow = startOfWeek(nowMs);
  const groups: Record<FeedGroupKey, NotificationItem[]> = { today: [], week: [], older: [] };
  for (const it of items) {
    const t = ts(it.createdOn);
    if (t >= sod) groups.today.push(it);
    else if (t >= sow) groups.week.push(it);
    else groups.older.push(it);
  }
  return (["today", "week", "older"] as FeedGroupKey[])
    .map((key) => ({ key, items: groups[key] }))
    .filter((g) => g.items.length > 0);
}
