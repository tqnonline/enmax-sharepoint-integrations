import { AUDIENCE } from "../home/homeUtils";

export const SEVERITY_OPTS = [
  { value: 1, label: "Info" },
  { value: 2, label: "Warning" },
  { value: 3, label: "Critical" },
] as const;

export const AUDIENCE_OPTS = [
  { value: AUDIENCE.Users, label: "Users" },
  { value: AUDIENCE.Approvers, label: "Approvers" },
  { value: AUDIENCE.Admins, label: "Admins" },
  { value: AUDIENCE.Everyone, label: "Everyone" },
] as const;

export const SEVERITY_LABEL: Record<number, string> = { 0: "None", 1: "Info", 2: "Warning", 3: "Critical" };
const AUDIENCE_LABEL: Record<number, string> = { 1: "Users", 2: "Approvers", 3: "Admins", 4: "Everyone" };

export type DisplayStatus = "Draft" | "Scheduled" | "Active" | "Expired" | "Retired";
const STATUS_RETIRED = 5;

/** Effective status computed from dates (flow-free) + the stored Retired flag. */
export function computeDisplayStatus(
  b: { enmax_acdnstatus?: number; enmax_acdnstartsat?: string; enmax_acdnexpiresat?: string },
  nowMs: number,
): DisplayStatus {
  if (b.enmax_acdnstatus === STATUS_RETIRED) return "Retired";
  if (!b.enmax_acdnstartsat && !b.enmax_acdnexpiresat) return "Draft";
  const starts = b.enmax_acdnstartsat ? new Date(b.enmax_acdnstartsat).getTime() : 0;
  const expires = b.enmax_acdnexpiresat ? new Date(b.enmax_acdnexpiresat).getTime() : Number.POSITIVE_INFINITY;
  if (nowMs >= expires) return "Expired";
  if (nowMs < starts) return "Scheduled";
  return "Active";
}

export type StatusBadgeColor = "informative" | "brand" | "success" | "subtle" | "warning";
export const STATUS_COLOR: Record<DisplayStatus, StatusBadgeColor> = {
  Draft: "subtle",
  Scheduled: "informative",
  Active: "success",
  Expired: "subtle",
  Retired: "warning",
};

export function audienceLabels(csv: string | undefined): string {
  const vals = csvToAudience(csv);
  if (vals.length === 0) return "—";
  return vals.map((v) => AUDIENCE_LABEL[v] ?? "").filter(Boolean).join(", ");
}

export function audienceToCsv(values: number[]): string {
  return [...values].sort((a, b) => a - b).join(",");
}

export function csvToAudience(csv: string | undefined): number[] {
  if (!csv) return [];
  return csv.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
}

export interface BroadcastFormErrors {
  title?: string;
  body?: string;
  audience?: string;
  expiresAt?: string;
}

/** Validation shared by the editor + tested in isolation. */
export function validateBroadcast(input: {
  title: string; body: string; audience: number[]; startsAt: string; expiresAt: string;
}): BroadcastFormErrors {
  const errors: BroadcastFormErrors = {};
  const title = input.title.trim();
  if (title.length < 5 || title.length > 120) errors.title = "Title must be 5–120 characters.";
  const body = input.body.trim();
  if (body.length < 10 || body.length > 4000) errors.body = "Body must be 10–4000 characters.";
  if (input.audience.length === 0) errors.audience = "Select at least one audience.";
  if (input.startsAt && input.expiresAt && new Date(input.expiresAt).getTime() <= new Date(input.startsAt).getTime()) {
    errors.expiresAt = "Expires must be after Starts.";
  } else if (!input.expiresAt) {
    errors.expiresAt = "Expiry is required.";
  }
  return errors;
}
