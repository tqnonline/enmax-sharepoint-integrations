import { CheckoutStatus } from "../checkout/api/checkoutClient";
import { sheetStatusPresentation } from "../checkout/components/sheetStatusPresentation";
import type { SheetCheckoutInfo } from "../approvals/hooks/useSheetCheckouts";

/** Status filter values on Search (drawings / documents tabs). */
export type DocumentStatusSearchFilter =
  | "all"
  | "available"
  | "checkedout"
  | "pendingapproval"
  | "awaitingvalidation";

export const DOCUMENT_STATUS_OPTIONS: { value: DocumentStatusSearchFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "checkedout", label: "Checked Out" },
  { value: "pendingapproval", label: "Pending Approval" },
  { value: "awaitingvalidation", label: "Awaiting Validation" },
];

/** User-facing status label for a search document row (sheet or base). */
export function searchDocumentStatusLabel(
  sheetOrDrawingState: number | undefined,
  checkout?: SheetCheckoutInfo,
): string {
  return sheetStatusPresentation(sheetOrDrawingState, checkout).label;
}

/**
 * Who holds / requested the document for active checkout workflows.
 * Empty when Available / Allocated / no open checkout.
 */
export function searchDocumentHolderDetail(
  statusLabel: string,
  checkout?: SheetCheckoutInfo,
): string {
  const who = checkout?.checkedOutByName?.trim();
  if (!who) return "";
  switch (statusLabel) {
    case "Pending Approval":
      return `Check-out requested by ${who}`;
    case "Checked Out":
      return `Checked out to ${who}`;
    case "Awaiting Validation":
      return `Check-in requested by ${who}`;
    default:
      return "";
  }
}

export function matchesDocumentStatusFilter(
  statusLabel: string,
  filter: DocumentStatusSearchFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "available") return statusLabel === "Available" || statusLabel === "Allocated";
  if (filter === "checkedout") return statusLabel === "Checked Out";
  if (filter === "pendingapproval") return statusLabel === "Pending Approval";
  if (filter === "awaitingvalidation") return statusLabel === "Awaiting Validation";
  return true;
}

/** Prefer the open-workflow checkout status when classifying filter buckets. */
export function isOpenCheckoutStatus(status?: number): boolean {
  return status === CheckoutStatus.Open
    || status === CheckoutStatus.Requested
    || status === CheckoutStatus.AwaitingValidation;
}
