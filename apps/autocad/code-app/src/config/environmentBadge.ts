/**
 * App Config key `EnvironmentBadge` controls the non-production environment chip
 * in the Code App header (Rule 15 — never read process env; App Configuration only).
 *
 * Production / Prod / blank → hidden. Any other label (Sandbox, DEV, UAT, …) → shown.
 */
export function resolveEnvironmentBadgeLabel(raw: string | undefined | null): string | null {
  const label = (raw ?? "").trim();
  if (!label) return null;
  const normalized = label.toLowerCase();
  if (normalized === "production" || normalized === "prod") return null;
  return label.toUpperCase();
}
