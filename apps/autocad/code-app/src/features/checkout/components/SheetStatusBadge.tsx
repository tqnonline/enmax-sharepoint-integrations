import { Badge } from "@fluentui/react-components";
import { sheetStatusPresentation } from "./sheetStatusPresentation";
import type { SheetCheckoutInfo } from "../../approvals/hooks/useSheetCheckouts";

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
