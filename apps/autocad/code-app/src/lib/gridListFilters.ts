import { defaultGridDateRange } from "./dateRangeDefaults";

export interface GridListDateFilters {
  from: string;
  to: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `s` is a YYYY-MM-DD string (HTML date input format). */
export function isIsoDateString(s: string): boolean {
  const value = s.trim();
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day;
}

/** Parse YYYY-MM-DD as local calendar midnight (matches HTML date inputs). */
export function parseLocalIsoDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function endOfLocalIsoDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d + 1).getTime() - 1;
}

/**
 * Ensure grid date filters are valid and chronological.
 * Empty, malformed, or inverted ranges reset to today − fromDays … today.
 */
export function normalizeGridDateRange(
  from: string,
  to: string,
  now = new Date(),
  fromDays?: number,
): GridListDateFilters {
  const defaults = defaultGridDateRange(now, fromDays);
  const f = from.trim();
  const t = to.trim();
  if (!isIsoDateString(f) || !isIsoDateString(t) || f > t) {
    return defaults;
  }
  return { from: f, to: t };
}

/** Default inclusive date window (today − fromDays through today). */
export function defaultGridListDateFilters(
  now = new Date(),
  fromDays?: number,
): GridListDateFilters {
  return defaultGridDateRange(now, fromDays);
}

export function isDefaultGridDateRange(
  from: string,
  to: string,
  now = new Date(),
  fromDays?: number,
): boolean {
  const expected = defaultGridDateRange(now, fromDays);
  return from === expected.from && to === expected.to;
}

/** Millisecond bounds for an inclusive calendar-day range (local date inputs). */
export function dateRangeBounds(
  from: string,
  to: string,
  fromDays?: number,
): { fromMs: number; toMs: number } {
  const f = from.trim();
  const t = to.trim();
  // Explicit empty bounds = unbounded (e.g. badge totals without date filter).
  if (!f && !t) {
    return { fromMs: Number.NEGATIVE_INFINITY, toMs: Number.POSITIVE_INFINITY };
  }
  const normalized = normalizeGridDateRange(f, t, new Date(), fromDays);
  return {
    fromMs: parseLocalIsoDate(normalized.from),
    toMs: endOfLocalIsoDate(normalized.to),
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
