import { describe, it, expect } from "vitest";
import { feedUnreadCount, badgeLabel, groupFeed, startOfWeek } from "../../app/notificationUtils";
import type { NotificationItem } from "../../app/useNotificationFeed";

const notif = (over: Partial<NotificationItem>): NotificationItem => ({
  id: "n", title: "N", body: "", severity: 1, read: false, deepLinkPath: "", createdOn: "", ...over,
});

describe("feedUnreadCount", () => {
  it("counts only unread notifications", () => {
    expect(feedUnreadCount([notif({ read: false }), notif({ read: true }), notif({ read: false })])).toBe(2);
  });
});

describe("badgeLabel", () => {
  it("clamps at 99+", () => {
    expect(badgeLabel(5)).toBe("5");
    expect(badgeLabel(99)).toBe("99");
    expect(badgeLabel(100)).toBe("99+");
    expect(badgeLabel(1500)).toBe("99+");
  });
});

describe("groupFeed", () => {
  it("buckets into Today / Earlier this week / Older", () => {
    const DAY = 86_400_000, HOUR = 3_600_000;
    const sow = startOfWeek(Date.parse("2026-06-10T00:00:00Z")); // Monday 00:00 local
    const now = sow + 3 * DAY + 12 * HOUR; // Thursday midday
    const items = [
      notif({ id: "today", createdOn: new Date(now - 2 * HOUR).toISOString() }),
      notif({ id: "week", createdOn: new Date(sow + DAY).toISOString() }), // Tuesday
      notif({ id: "older", createdOn: new Date(sow - 3 * DAY).toISOString() }), // last week
    ];
    const groups = groupFeed(items, now);
    expect(groups.map((g) => g.key)).toEqual(["today", "week", "older"]);
    expect(groups.find((g) => g.key === "today")!.items[0].id).toBe("today");
    expect(groups.find((g) => g.key === "week")!.items[0].id).toBe("week");
    expect(groups.find((g) => g.key === "older")!.items[0].id).toBe("older");
  });

  it("drops empty groups", () => {
    const now = Date.parse("2026-06-10T12:00:00Z");
    const groups = groupFeed([notif({ createdOn: new Date(now).toISOString() })], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("today");
  });
});
