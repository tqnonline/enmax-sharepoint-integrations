import { CheckoutStatus } from "../api/checkoutClient";
import {
  SHEET_STATE_AVAILABLE,
  SHEET_STATE_LABELS,
} from "../../approvals/hooks/useDrawingSheets";
import type { SheetCheckoutInfo } from "../../approvals/hooks/useSheetCheckouts";

type BadgeColor = "success" | "warning" | "informative" | "subtle" | "danger" | "brand";

const CLOSED_CHECKOUT_STATUSES = new Set<number>([
  CheckoutStatus.ClosedApproved,
  CheckoutStatus.ClosedDeclined,
  CheckoutStatus.ClosedForced,
]);

/** True when this sheet has completed (or at least closed) a checkout cycle. */
export function sheetHasPriorCheckout(checkout?: SheetCheckoutInfo): boolean {
  if (!checkout) return false;
  if (checkout.closedOn) return true;
  return CLOSED_CHECKOUT_STATUSES.has(checkout.status);
}

/**
 * User-facing sheet status for grids.
 * Issuance leaves sheets in Available with no checkout history — show Allocated
 * until the first checkout cycle completes, then Available after check-in.
 */
export function sheetStatusPresentation(
  sheetState?: number,
  checkout?: SheetCheckoutInfo,
): { label: string; color: BadgeColor } {
  if (checkout?.status === CheckoutStatus.Requested) {
    return { label: "Pending Approval", color: "warning" };
  }
  if (checkout?.status === CheckoutStatus.Open) {
    return { label: "Checked Out", color: "warning" };
  }
  if (checkout?.status === CheckoutStatus.AwaitingValidation) {
    return { label: "Awaiting Validation", color: "informative" };
  }
  if (sheetState === SHEET_STATE_AVAILABLE || sheetState == null) {
    if (!sheetHasPriorCheckout(checkout)) {
      return { label: "Allocated", color: "success" };
    }
    return { label: "Available", color: "success" };
  }
  const label = SHEET_STATE_LABELS[sheetState ?? 0] ?? "Unknown";
  if (sheetState === 3) return { label, color: "warning" };
  if (sheetState === 4) return { label, color: "informative" };
  return { label, color: "subtle" };
}

export type { BadgeColor };
