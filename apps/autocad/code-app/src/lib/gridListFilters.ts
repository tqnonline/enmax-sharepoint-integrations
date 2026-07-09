import { defaultGridDateRange } from "./dateRangeDefaults";

export interface GridListDateFilters {
  from: string;
  to: string;
}

/** Default inclusive date window (today − 30 days through today). */
export function defaultGridListDateFilters(now = new Date()): GridListDateFilters {
  return defaultGridDateRange(now);
}

export function isDefaultGridDateRange(from: string, to: string, now = new Date()): boolean {
  const expected = defaultGridDateRange(now);
  return from === expected.from && to === expected.to;
}

/** Millisecond bounds for an inclusive calendar-day range (local date inputs). */
export function dateRangeBounds(from: string, to: string): { fromMs: number; toMs: number } {
  return {
    fromMs: from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY,
    toMs: to ? new Date(to).getTime() + 86_400_000 : Number.POSITIVE_INFINITY,
  };
}

/**
 * True when `iso` falls inside [from, to] (inclusive end-of-day).
 * Rows without a date are excluded only when either bound is set.
 */
export function inIsoDateRange(iso: string | undefined, from: string, to: string): boolean {
  const { fromMs, toMs } = dateRangeBounds(from, to);
  const hasBound = from !== "" || to !== "";
  if (!iso) return !hasBound;
  const ms = new Date(iso).getTime();
  return ms >= fromMs && ms <= toMs;
}

/** Text filter: empty needle matches all rows. */
export function matchesOptionalText(needle: string, ...fields: (string | undefined)[]): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return fields.join(" ").toLowerCase().includes(q);
}

/** People filter: empty list matches all rows. */
export function matchesOptionalPeople(peopleIds: string[], ...personIds: (string | undefined)[]): boolean {
  if (peopleIds.length === 0) return true;
  return peopleIds.some((id) => personIds.includes(id));
}
