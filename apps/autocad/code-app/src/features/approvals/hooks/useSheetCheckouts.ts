import { useQuery } from "@tanstack/react-query";
import { Enmax_autocadcheckoutsService } from "../../../generated";
import { CHECKOUT_STATUS_LABELS, CheckoutStatus } from "../../checkout/api/checkoutClient";
import { logDataverseError } from "../../../components/DataGrid/dataverseError";

const OPEN_STATUSES = new Set<number>([
  CheckoutStatus.Open,
  CheckoutStatus.AwaitingValidation,
  CheckoutStatus.Requested,
]);

export interface SheetCheckoutInfo {
  checkoutId: string;
  status: number;
  statusLabel: string;
  checkedOutBy?: string;
  checkedOutOn?: string;
  checkedOutByName?: string;
  closedOn?: string;
  closedByName?: string;
  requestedOn?: string;
}

function rowToInfo(raw: Record<string, unknown>): SheetCheckoutInfo {
  const status = (raw["enmax_acdnstatus"] as number) ?? 0;
  return {
    checkoutId: (raw["enmax_autocadcheckoutid"] as string) ?? "",
    status,
    statusLabel: CHECKOUT_STATUS_LABELS[status] ?? "Unknown",
    checkedOutBy: (raw["_enmax_acdncheckedoutby_value"] as string | undefined) ?? undefined,
    checkedOutOn: (raw["enmax_acdncheckedouton"] as string | undefined) ?? undefined,
    checkedOutByName:
      (raw["_enmax_acdncheckedoutby_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? undefined,
    closedOn: (raw["enmax_acdnclosedon"] as string | undefined) ?? undefined,
    closedByName:
      (raw["_enmax_acdnclosedby_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? undefined,
    requestedOn: (raw["createdon"] as string | undefined) ?? undefined,
  };
}

function pickCheckoutForSheet(rows: Record<string, unknown>[]): SheetCheckoutInfo | undefined {
  if (rows.length === 0) return undefined;
  const sorted = [...rows].sort((a, b) =>
    String(b["createdon"] ?? "").localeCompare(String(a["createdon"] ?? "")),
  );
  const active = sorted.find((r) => OPEN_STATUSES.has((r["enmax_acdnstatus"] as number) ?? 0));
  return rowToInfo(active ?? sorted[0]!);
}

async function fetchSheetCheckouts(drawingId: string): Promise<Map<string, SheetCheckoutInfo>> {
  const result = await Enmax_autocadcheckoutsService.getAll({
    filter: `_enmax_acdndrawing_value eq '${drawingId}'`,
    select: [
      "enmax_autocadcheckoutid",
      "enmax_acdnstatus",
      "enmax_acdncheckedouton",
      "enmax_acdnclosedon",
      "createdon",
      "_enmax_acdnsheet_value",
      "_enmax_acdncheckedoutby_value",
      "_enmax_acdnclosedby_value",
    ],
    orderBy: ["createdon desc"],
    top: 500,
  } as Parameters<typeof Enmax_autocadcheckoutsService.getAll>[0]);

  const map = new Map<string, SheetCheckoutInfo>();
  if (!result.success) {
    logDataverseError("SheetCheckouts", result.error);
    return map;
  }

  const bySheet = new Map<string, Record<string, unknown>[]>();
  for (const raw of (result.data ?? []) as unknown as Record<string, unknown>[]) {
    const sheetId = (raw["_enmax_acdnsheet_value"] as string | undefined) ?? "";
    if (!sheetId) continue;
    const list = bySheet.get(sheetId) ?? [];
    list.push(raw);
    bySheet.set(sheetId, list);
  }

  for (const [sheetId, rows] of bySheet) {
    const info = pickCheckoutForSheet(rows);
    if (info) map.set(sheetId, info);
  }
  return map;
}

export function useSheetCheckouts(drawingId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["sheet-checkouts", drawingId],
    queryFn: () => fetchSheetCheckouts(drawingId),
    enabled: enabled && !!drawingId,
    staleTime: 30_000,
    throwOnError: false,
  });
}
