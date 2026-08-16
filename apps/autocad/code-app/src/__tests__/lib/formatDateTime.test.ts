import { exportCsvFileName, exportTimestamp, formatDateTimeLocale, formatGridDate, formatGridDateTime } from "../../lib/formatDateTime";

test("formatDateTimeLocale returns empty for blank/invalid", () => {
  expect(formatDateTimeLocale("")).toBe("");
  expect(formatDateTimeLocale(undefined)).toBe("");
  expect(formatDateTimeLocale("not-a-date")).toBe("");
});

test("formatDateTimeLocale uses locale date+time for a real ISO timestamp", () => {
  const out = formatDateTimeLocale("2026-05-01T10:00:00Z");
  expect(out.length).toBeGreaterThan(0);
  expect(out).not.toBe("—");
  expect(out).not.toMatch(/ago/i);
});

test("formatGridDateTime never returns relative ago text", () => {
  const out = formatGridDateTime("2026-05-01T10:00:00Z");
  expect(out).not.toMatch(/ago/i);
  expect(formatGridDateTime("")).toBe("—");
});

test("formatGridDate uses locale date only", () => {
  const out = formatGridDate("2026-05-01T10:00:00Z");
  expect(out).not.toMatch(/ago/i);
  expect(out.length).toBeGreaterThan(0);
});

test("exportCsvFileName stamps local wall-clock into the download name", () => {
  const fixed = new Date(2026, 6, 8, 20, 26, 43); // local Jul 8 2026 20:26:43
  expect(exportTimestamp(fixed)).toBe("20260708_202643");
  expect(exportCsvFileName("my-reservations", fixed)).toBe("my-reservations-20260708_202643.csv");
  expect(exportCsvFileName("my reservations.csv", fixed)).toBe("my-reservations-20260708_202643.csv");
});
