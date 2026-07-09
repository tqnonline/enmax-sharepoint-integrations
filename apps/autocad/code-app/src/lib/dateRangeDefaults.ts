/** ISO date (YYYY-MM-DD) for `days` before today (local calendar). */
export function isoDateDaysAgo(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Today's date as ISO YYYY-MM-DD in local calendar. */
export function isoDateToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export const GRID_DEFAULT_FROM_DAYS = 30;

export function defaultGridDateRange(now = new Date()): { from: string; to: string } {
  return {
    from: isoDateDaysAgo(GRID_DEFAULT_FROM_DAYS, now),
    to: isoDateToday(now),
  };
}
