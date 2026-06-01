import type { Role } from "../../auth/useUserRole";

/** Time-of-day greeting. Hour is 0–23 (pass new Date().getHours()). Pure for testability. */
export function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** First token of a display name; falls back to "there" so the hero never reads "Good morning, ". */
export function firstName(fullName?: string): string {
  const first = fullName?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : "there";
}

/** Relative "Xm/h/d ago" — matches the app-wide convention. */
export function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Broadcast audience (multi-select option values, stored comma-separated) ──
export const AUDIENCE = { Users: 1, Approvers: 2, Admins: 3, Everyone: 4 } as const;

/** True when a broadcast's audience targets the given role (or Everyone). */
export function audienceTargetsRole(audience: string | undefined, role: Role): boolean {
  if (!audience) return false;
  const vals = audience.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
  if (vals.includes(AUDIENCE.Everyone)) return true;
  if (role === "Admin" && vals.includes(AUDIENCE.Admins)) return true;
  if (role === "Approver" && vals.includes(AUDIENCE.Approvers)) return true;
  if (role === "User" && vals.includes(AUDIENCE.Users)) return true;
  return false;
}

// ── Broadcast active window (flow-free: computed client-side, not from a stale status flow) ──
const BROADCAST_RETIRED = 5;

interface BroadcastWindow {
  enmax_acdnstartsat?: string;
  enmax_acdnexpiresat?: string;
  enmax_acdnstatus?: number;
  statecode?: number;
}

/** Active = record active (statecode 0), not Retired, and now within [startsAt, expiresAt). */
export function isBroadcastActive(b: BroadcastWindow, nowMs: number): boolean {
  if (b.statecode !== 0 && b.statecode !== undefined) return false;
  if (b.enmax_acdnstatus === BROADCAST_RETIRED) return false;
  const starts = b.enmax_acdnstartsat ? new Date(b.enmax_acdnstartsat).getTime() : 0;
  const expires = b.enmax_acdnexpiresat ? new Date(b.enmax_acdnexpiresat).getTime() : Number.POSITIVE_INFINITY;
  return starts <= nowMs && nowMs < expires;
}

// ── Severity → Fluent intent (no hardcoded colors; MessageBar/Badge consume these) ──
export type SeverityIntent = "info" | "warning" | "error" | "success";
const BROADCAST_SEVERITY_INTENT: Record<number, SeverityIntent> = {
  0: "info", // None
  1: "info", // Info
  2: "warning", // Warning
  3: "error", // Critical
};
export function broadcastSeverityIntent(severity: number | undefined): SeverityIntent {
  return BROADCAST_SEVERITY_INTENT[severity ?? 1] ?? "info";
}

// Higher severity sorts first on Home.
export function severityRank(severity: number | undefined): number {
  return severity ?? 0;
}
