/** YYYY-MM-DD in the user's local calendar (matches HTML date inputs). */
function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO date (YYYY-MM-DD) for `days` before today (local calendar). */
export function isoDateDaysAgo(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return localIsoDate(d);
}

/** Today's date as ISO YYYY-MM-DD in local calendar. */
export function isoDateToday(now = new Date()): string {
  return localIsoDate(now);
}

export const GRID_DEFAULT_FROM_DAYS = 30;

export function defaultGridDateRange(now = new Date()): { from: string; to: string } {
  return {
    from: isoDateDaysAgo(GRID_DEFAULT_FROM_DAYS, now),
    to: isoDateToday(now),
  };
}
