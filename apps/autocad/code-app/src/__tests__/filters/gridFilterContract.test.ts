import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  defaultGridListDateFilters,
  dateRangeBounds,
  inIsoDateRange,
  isDefaultGridDateRange,
  matchesOptionalPeople,
  matchesOptionalText,
  normalizeGridDateRange,
  parseLocalIsoDate,
} from "../../lib/gridListFilters";
import { GRID_DEFAULT_FROM_DAYS, defaultGridDateRange, isoDateDaysAgo, isoDateToday } from "../../lib/dateRangeDefaults";

const FIXED_NOW = new Date("2026-07-09T12:00:00.000Z");

describe("grid filter contract — shared defaults", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it(`default date range is today minus ${GRID_DEFAULT_FROM_DAYS} days through today`, () => {
    vi.setSystemTime(FIXED_NOW);
    const { from, to } = defaultGridDateRange();
    expect(from).toBe(isoDateDaysAgo(30, FIXED_NOW));
    expect(to).toBe(isoDateToday(FIXED_NOW));
    expect(isDefaultGridDateRange(from, to, FIXED_NOW)).toBe(true);
  });

  it("defaultGridListDateFilters matches defaultGridDateRange", () => {
    vi.setSystemTime(FIXED_NOW);
    expect(defaultGridListDateFilters(FIXED_NOW)).toEqual(defaultGridDateRange(FIXED_NOW));
  });
});

describe("grid filter contract — optional field filters", () => {
  it("empty text needle matches every row", () => {
    expect(matchesOptionalText("", "Alpha", undefined)).toBe(true);
    expect(matchesOptionalText("  ", "Beta")).toBe(true);
  });

  it("text needle filters only when non-empty", () => {
    expect(matchesOptionalText("alpha", "Alpha document")).toBe(true);
    expect(matchesOptionalText("gamma", "Alpha document")).toBe(false);
  });

  it("empty people list matches every row", () => {
    expect(matchesOptionalPeople([], "user-a", "user-b")).toBe(true);
  });

  it("people filter applies only when ids are provided", () => {
    expect(matchesOptionalPeople(["user-a"], "user-a", "user-b")).toBe(true);
    expect(matchesOptionalPeople(["user-c"], "user-a", "user-b")).toBe(false);
  });
});

describe("grid filter contract — date range", () => {
  it("inclusive end-of-day on to date", () => {
    const { fromMs, toMs } = dateRangeBounds("2026-06-10", "2026-06-20");
    expect(fromMs).toBe(parseLocalIsoDate("2026-06-10"));
    expect(toMs).toBe(parseLocalIsoDate("2026-06-21") - 1);
  });

  it("ends at local midnight across daylight-saving transitions", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/Edmonton";
    try {
      const { toMs } = dateRangeBounds("2026-03-01", "2026-03-08");
      expect(toMs).toBe(parseLocalIsoDate("2026-03-09") - 1);
    } finally {
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });

  it("empty from/to means unbounded range", () => {
    expect(inIsoDateRange("2020-01-01T00:00:00Z", "", "")).toBe(true);
    expect(inIsoDateRange(undefined, "", "")).toBe(true);
  });

  it("rows without dates are excluded when a date bound is set", () => {
    expect(inIsoDateRange(undefined, "2026-06-01", "2026-06-30")).toBe(false);
    expect(inIsoDateRange("", "2026-06-01", "2026-06-30")).toBe(false);
  });

  it("filters inside the inclusive window", () => {
    expect(inIsoDateRange("2026-06-15T10:00:00Z", "2026-06-10", "2026-06-20")).toBe(true);
    expect(inIsoDateRange("2026-06-08T10:00:00Z", "2026-06-10", "2026-06-20")).toBe(false);
    expect(inIsoDateRange("2026-06-21T12:00:00Z", "2026-06-10", "2026-06-20")).toBe(false);
  });

  it("normalizeGridDateRange resets inverted or invalid ranges to the 30-day default", () => {
    vi.setSystemTime(FIXED_NOW);
    const defaults = defaultGridDateRange(FIXED_NOW);
    expect(normalizeGridDateRange("2026-08-10", "2026-07-10", FIXED_NOW)).toEqual(defaults);
    expect(normalizeGridDateRange("", "", FIXED_NOW)).toEqual(defaults);
    expect(normalizeGridDateRange("not-a-date", "2026-07-10", FIXED_NOW)).toEqual(defaults);
    expect(normalizeGridDateRange("2026-02-31", "2026-07-10", FIXED_NOW)).toEqual(defaults);
  });
});
