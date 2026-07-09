/** Format an ISO / Dataverse datetime in the browser's locale (date + time). */
export function formatDateTimeLocale(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format date-only (no time) in the browser's locale. */
export function formatDateLocale(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Grid cell: locale date+time, or em dash when empty/invalid. */
export function formatGridDateTime(value: string | null | undefined): string {
  return formatDateTimeLocale(value) || "—";
}

/** Grid cell: locale date-only, or em dash when empty/invalid. */
export function formatGridDate(value: string | null | undefined): string {
  return formatDateLocale(value) || "—";
}

/** CSV export for datetime columns — locale formatted, blank when invalid. */
export function exportDateTimeLocale(value: unknown): string {
  return formatDateTimeLocale(value == null ? "" : String(value));
}

/** CSV export for date-only columns — locale formatted, blank when invalid. */
export function exportDateLocale(value: unknown): string {
  return formatDateLocale(value == null ? "" : String(value));
}

/** Stamp suitable for export / email attachment filenames (local wall clock). */
export function exportTimestamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

/** Build `prefix-YYYYMMDD_HHmmss.csv` for downloads that are still CSV under the hood. */
export function exportCsvFileName(prefix: string, now = new Date()): string {
  const withoutExt = prefix.replace(/\.csv$/i, "");
  const safe = withoutExt
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "export";
  return `${safe}-${exportTimestamp(now)}.csv`;
}
