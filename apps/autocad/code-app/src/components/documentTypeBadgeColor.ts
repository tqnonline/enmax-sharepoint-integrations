import type { BadgeProps } from "@fluentui/react-components";

export type DocumentTypeBadgeColor = NonNullable<BadgeProps["color"]>;

/**
 * Stable color coding for taxonomy type labels shown across Search, Approvals,
 * My Reservations, Home, and detail surfaces.
 *
 * Drawing            → brand (primary)
 * Drawing Document   → informative (blue sibling of Drawing)
 * Standard           → success (green)
 * Procedure          → warning (amber)
 * Form               → important (purple)
 */
export function documentTypeBadgeColor(
  label: string | null | undefined,
): DocumentTypeBadgeColor {
  const key = (label ?? "").trim().toLowerCase();
  switch (key) {
    case "drawing":
    case "drawing sheet":
    case "drawing sheets":
    case "drawing number":
      return "brand";
    case "drawing document":
    case "drawing documents":
      return "informative";
    case "standard":
    case "standards":
      return "success";
    case "procedure":
    case "procedures":
      return "warning";
    case "form":
    case "forms":
    case "form number":
      return "important";
    default:
      return "subtle";
  }
}
