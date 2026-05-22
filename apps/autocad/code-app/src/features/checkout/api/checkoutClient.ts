import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../../../.power/schemas/appschemas/dataSourcesInfo";
import { Enmax_autocadcheckoutsService } from "../../../generated/services/Enmax_autocadcheckoutsService";
import { Enmax_autocaddrawingsService } from "../../../generated/services/Enmax_autocaddrawingsService";

const client = getClient(dataSourcesInfo);

export const DrawingState = {
  None: 0,
  Available: 1,
  CheckedOut: 2,
  AwaitingValidation: 3,
  CheckedIn: 4,
  Obsolete: 5,
  Void: 6,
} as const;

export type DrawingStateValue = (typeof DrawingState)[keyof typeof DrawingState];

export const CheckoutStatus = {
  None: 0,
  Open: 1,
  AwaitingValidation: 2,
  ClosedApproved: 3,
  ClosedDeclined: 4,
  ClosedForced: 5,
} as const;

export interface DrawingForPanel {
  id: string;
  state: DrawingStateValue;
  number?: string;
  spLibraryUrl?: string;
  currentRevision?: string;
  missingSheets?: string;
}

export interface CheckoutForPanel {
  id: string;
  checkedOutBy?: string;
  checkedOutOn?: string;
  newRevision?: string;
  newPdfUrls?: string;
}

export async function checkOut(drawingId: string): Promise<{ checkoutId: string }> {
  const result = await client.executeAsync<Record<string, unknown>, Record<string, unknown>>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnCheckOutDrawing",
        tableName: "enmax_autocaddrawings",
        body: { drawingId },
      },
    },
  });
  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "CheckOut failed");
  }
  return { checkoutId: (result.data?.["CheckoutId"] as string) ?? "" };
}

export interface SubmitRevisionInput {
  checkoutId: string;
  drawingId: string;
  newRevision: string;
}

export async function submitRevision(input: SubmitRevisionInput): Promise<void> {
  const checkoutResult = await Enmax_autocadcheckoutsService.update(input.checkoutId, {
    enmax_acdnstatus: CheckoutStatus.AwaitingValidation,
    enmax_acdnnewrevision: input.newRevision,
  });
  if (!checkoutResult.success) {
    const err = checkoutResult.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Submit revision failed");
  }

  const drawingResult = await Enmax_autocaddrawingsService.update(input.drawingId, {
    enmax_acdnstate: DrawingState.AwaitingValidation,
  });
  if (!drawingResult.success) {
    const err = drawingResult.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Drawing state update failed");
  }
}

export async function checkIn(input: SubmitRevisionInput): Promise<void> {
  await submitRevision(input);
  await approveCheckin({ checkoutId: input.checkoutId, decision: "Approved" });
}

export interface ApproveCheckinInput {
  checkoutId: string;
  decision: "Approved" | "Declined";
  reason?: string;
}

export async function approveCheckin(input: ApproveCheckinInput): Promise<void> {
  const result = await client.executeAsync<Record<string, unknown>, unknown>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnApproveCheckin",
        tableName: "enmax_autocadcheckouts",
        body: {
          checkoutId: input.checkoutId,
          Decision: input.decision === "Approved" ? 1 : 2,
          Reason: input.reason ?? "",
        },
      },
    },
  });
  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Approve checkin failed");
  }
}

export interface ForceCheckinInput {
  checkoutId: string;
  reason: string;
}

export async function forceCheckin(input: ForceCheckinInput): Promise<void> {
  const result = await client.executeAsync<Record<string, unknown>, unknown>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnForceCheckin",
        tableName: "enmax_autocadcheckouts",
        body: {
          checkoutId: input.checkoutId,
          Reason: input.reason,
        },
      },
    },
  });
  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Force checkin failed");
  }
}

export function nextRevision(current?: string): string {
  if (!current) return "";
  const trimmed = current.trim().toUpperCase();
  if (/^[A-Z]+$/.test(trimmed)) {
    const code = trimmed.charCodeAt(trimmed.length - 1);
    return code < 90 ? trimmed.slice(0, -1) + String.fromCharCode(code + 1) : "";
  }
  if (/^\d+$/.test(trimmed)) {
    return String(parseInt(trimmed, 10) + 1).padStart(trimmed.length, "0");
  }
  return "";
}

export function parsePdfUrls(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === "string");
  } catch {
    // fallback: newline or comma separated
  }
  return raw.split(/[\n,]/).map((u) => u.trim()).filter(Boolean);
}
