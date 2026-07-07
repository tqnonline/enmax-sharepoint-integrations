import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../../../.power/schemas/appschemas/dataSourcesInfo";

const client = getClient(dataSourcesInfo);

export const DrawingState = {
  None: 0,
  Available: 1,
  CheckedOut: 2,
  AwaitingValidation: 3,
  Obsolete: 5,
  Void: 6,
  Finalized: 7,
} as const;

export type DrawingStateValue = (typeof DrawingState)[keyof typeof DrawingState];

export type BadgeColor = "success" | "warning" | "informative" | "brand" | "subtle" | "danger";

export const DRAWING_STATE_LABELS: Record<number, string> = {
  0: "Unknown",
  1: "Available",
  2: "Checked Out",
  3: "Awaiting Validation",
  5: "Obsolete",
  6: "Released (Voided)",
  7: "Finalized",
};

export const DRAWING_STATE_BADGE_COLOR: Record<number, BadgeColor> = {
  0: "subtle",
  1: "success",
  2: "warning",
  3: "informative",
  5: "danger",
  6: "danger",
  7: "brand",
};

export const TERMINAL_DRAWING_STATES: ReadonlySet<number> = new Set([5, 6, 7]);

export const CheckoutStatus = {
  None: 0,
  Open: 1,
  AwaitingValidation: 2,
  ClosedApproved: 3,
  ClosedDeclined: 4,
  ClosedForced: 5,
  // WS3 gated Check Out: a request awaiting Approver/Admin approval. The drawing stays
  // Available until enmax_acdnApproveCheckout moves it to CheckedOut.
  Requested: 6,
} as const;

export const CHECKOUT_STATUS_LABELS: Record<number, string> = {
  1: "Open",
  2: "Awaiting Validation",
  3: "Approved",
  4: "Declined",
  5: "Force-Closed",
  6: "Requested",
};

export interface DrawingForPanel {
  id: string;
  state: DrawingStateValue;
  number?: string;
  spLibraryUrl?: string;
  /** WS3: read-only link to the final destination library copy (populated by the WS5 indexer). */
  spDestinationUrl?: string;
  currentRevision?: string;
  missingSheets?: string;
  /** systemuser GUID of the drawing owner (reservation requester). Used to gate self-release. */
  ownerId?: string;
}

export interface CheckoutForPanel {
  id: string;
  /** enmax_acdn_checkoutstatus value (Open=1, AwaitingValidation=2, Requested=6, ...). */
  status?: number;
  checkedOutBy?: string;
  checkedOutOn?: string;
  /** WS3: mandatory Submission Information (Project, WO#, ...) captured at Check In. */
  submissionInfo?: string;
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
  /** WS3: mandatory Submission Information (Project, WO#, ...). Replaces the revision number. */
  submissionInfo: string;
}

export async function submitRevision(input: SubmitRevisionInput): Promise<void> {
  const result = await client.executeAsync<Record<string, unknown>, unknown>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnSubmitRevision",
        tableName: "enmax_autocadcheckouts",
        body: {
          checkoutId: input.checkoutId,
          SubmissionInfo: input.submissionInfo,
        },
      },
    },
  });
  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Submit revision failed");
  }
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

export interface ApproveCheckoutInput {
  checkoutId: string;
  decision: "Approved" | "Declined";
  reason?: string;
}

export interface ApproveCheckoutResult {
  checkoutId: string;
  newStatus: number;
  drawingState: number;
}

export async function approveCheckout(input: ApproveCheckoutInput): Promise<ApproveCheckoutResult> {
  const result = await client.executeAsync<Record<string, unknown>, Record<string, unknown>>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnApproveCheckout",
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
    throw new Error(err?.message ?? "Approve checkout failed");
  }
  return {
    checkoutId: (result.data?.["CheckoutId"] as string) ?? input.checkoutId,
    newStatus: Number(result.data?.["NewStatus"] ?? 0),
    drawingState: Number(result.data?.["DrawingState"] ?? 0),
  };
}

export interface ForceCheckinInput {
  checkoutId: string;
  drawingId: string;
  reason: string;
}

export async function forceCheckin(input: ForceCheckinInput): Promise<void> {
  // WS3: the revision number is gone — the server stamps an internal cycle token when
  // NewRevision is omitted, so the client no longer sends one.
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

export interface FinalizeDrawingInput {
  drawingId: string;
  reason: string;
}

export async function finalizeDrawing(input: FinalizeDrawingInput): Promise<void> {
  const result = await client.executeAsync<Record<string, unknown>, unknown>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnFinalizeDrawing",
        tableName: "enmax_autocaddrawings",
        body: { drawingId: input.drawingId, Reason: input.reason },
      },
    },
  });
  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Finalize failed");
  }
}

export interface MarkDrawingInput {
  drawingId: string;
  reason?: string;
}

export async function markObsolete(input: MarkDrawingInput): Promise<void> {
  const result = await client.executeAsync<Record<string, unknown>, unknown>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnMarkObsolete",
        tableName: "enmax_autocaddrawings",
        body: { drawingId: input.drawingId, Reason: input.reason ?? "" },
      },
    },
  });
  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Mark obsolete failed");
  }
}

export interface ReleaseDrawingInput {
  drawingId: string;
  reason: string;
}

export async function releaseDrawing(
  input: ReleaseDrawingInput,
): Promise<{ newState: string; sequenceKeyBurned: string }> {
  const result = await client.executeAsync<Record<string, unknown>, Record<string, unknown>>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnReleaseDrawing",
        tableName: "enmax_autocaddrawings",
        body: { drawingId: input.drawingId, Reason: input.reason },
      },
    },
  });
  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Release failed");
  }
  return {
    newState: (result.data?.["NewState"] as string) ?? "Void",
    sequenceKeyBurned: (result.data?.["SequenceKeyBurned"] as string) ?? "",
  };
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
