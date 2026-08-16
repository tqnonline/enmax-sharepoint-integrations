import type { BadgeProps } from "@fluentui/react-components";
// Semantic: green positive, red negative, amber caution, informative neutral.
export const AUDIT_EVENT_COLOR: Record<number, NonNullable<BadgeProps["color"]>> = {
  1: "success",
  2: "informative",
  3: "success",
  4: "danger",
  5: "warning",
  6: "warning",
  7: "informative",
  8: "informative",
  9: "success",
};
export function auditEventColor(event: number): NonNullable<BadgeProps["color"]> {
  return AUDIT_EVENT_COLOR[event] ?? "subtle";
}
