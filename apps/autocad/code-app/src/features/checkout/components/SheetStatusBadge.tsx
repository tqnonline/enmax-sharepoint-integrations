import { Badge } from "@fluentui/react-components";
import { CheckoutStatus } from "../api/checkoutClient";
import {
  SHEET_STATE_AVAILABLE,
  SHEET_STATE_LABELS,
} from "../../approvals/hooks/useDrawingSheets";
import type { SheetCheckoutInfo } from "../../approvals/hooks/useSheetCheckouts";

type BadgeColor = "success" | "warning" | "informative" | "subtle" | "danger" | "brand";

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
  const label = SHEET_STATE_LABELS[sheetState ?? 0] ?? "Unknown";
  if (sheetState === SHEET_STATE_AVAILABLE) return { label, color: "success" };
  if (sheetState === 3) return { label, color: "warning" };
  if (sheetState === 4) return { label, color: "informative" };
  return { label, color: "subtle" };
}

interface Props {
  sheetState?: number;
  checkout?: SheetCheckoutInfo;
  size?: "small" | "medium" | "extra-small";
}

export function SheetStatusBadge({ sheetState, checkout, size = "medium" }: Props) {
  const { label, color } = sheetStatusPresentation(sheetState, checkout);
  return (
    <Badge appearance="filled" color={color} size={size} shape="rounded">
      {label}
    </Badge>
  );
}
