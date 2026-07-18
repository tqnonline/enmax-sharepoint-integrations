import { useQuery } from "@tanstack/react-query";
import { Enmax_autocadsheetsService, Enmax_autocadcheckoutsService } from "../../../generated";
import { logDataverseError } from "../../../components/DataGrid/dataverseError";
import { isGuid } from "../../../lib/guid";
import {
  CHECKOUT_STATUS_LABELS,
  CheckoutStatus,
} from "../../checkout/api/checkoutClient";
import type { SheetDetail } from "./useDrawingSheets";
import type { SheetCheckoutInfo } from "./useSheetCheckouts";

const OPEN_STATUSES = new Set<number>([
  CheckoutStatus.Open,
  CheckoutStatus.AwaitingValidation,
  CheckoutStatus.Requested,
]);

export interface ReservationSheetRow extends SheetDetail {
  drawingId: string;
  drawingNumber?: string;
  checkout?: SheetCheckoutInfo;
}

function rowToCheckoutInfo(raw: Record<string, unknown>): SheetCheckoutInfo {
  const status = (raw["enmax_acdnstatus"] as number) ?? 0;
  return {
    checkoutId: (raw["enmax_autocadcheckoutid"] as string) ?? "",
    status,
    statusLabel: CHECKOUT_STATUS_LABELS[status] ?? "Unknown",
    checkedOutBy: (raw["_enmax_acdncheckedoutby_value"] as string | undefined) ?? undefined,
    checkedOutOn: (raw["enmax_acdncheckedouton"] as string | undefined) ?? undefined,
    checkedOutByName:
      (raw["_enmax_acdncheckedoutby_value@OData.Community.Display.V1.FormattedValue"] as string | undefined)
      ?? undefined,
    closedOn: (raw["enmax_acdnclosedon"] as string | undefined) ?? undefined,
    closedByName:
      (raw["_enmax_acdnclosedby_value@OData.Community.Display.V1.FormattedValue"] as string | undefined)
      ?? undefined,
    requestedOn: (raw["createdon"] as string | undefined) ?? undefined,
  };
}

function pickCheckout(rows: Record<string, unknown>[]): SheetCheckoutInfo | undefined {
  if (rows.length === 0) return undefined;
  const sorted = [...rows].sort((a, b) =>
    String(b["createdon"] ?? "").localeCompare(String(a["createdon"] ?? "")),
  );
  const active = sorted.find((r) => OPEN_STATUSES.has((r["enmax_acdnstatus"] as number) ?? 0));
  return rowToCheckoutInfo(active ?? sorted[0]!);
}

async function fetchReservationSheets(
  drawings: { id: string; number?: string }[],
): Promise<ReservationSheetRow[]> {
  const valid = drawings.filter((d) => isGuid(d.id));
  if (valid.length === 0) return [];

  const drawingFilter = valid.map((d) => `_enmax_acdndrawing_value eq ${d.id}`).join(" or ");
  const sheetsResult = await Enmax_autocadsheetsService.getAll({
    filter: `(${drawingFilter})`,
    select: [
      "enmax_autocadsheetid",
      "_enmax_acdndrawing_value",
      "enmax_acdnsheetnumber",
      "enmax_acdnfilename",
      "enmax_acdnsharepointurl",
      "enmax_acdnspdestinationurl",
      "enmax_acdnpresentindropoff",
      "enmax_acdnpresentindestination",
      "enmax_acdnstate",
      "createdon",
    ],
    orderBy: ["enmax_acdnsheetnumber asc"],
    top: 500,
  } as Parameters<typeof Enmax_autocadsheetsService.getAll>[0]);

  if (!sheetsResult.success) {
    logDataverseError("ReservationSheets", sheetsResult.error);
    return [];
  }

  const drawingNumberById = new Map(valid.map((d) => [d.id, d.number]));
  const sheets: ReservationSheetRow[] = (sheetsResult.data ?? []).map((s) => {
    const drawingId = (s as { _enmax_acdndrawing_value?: string })._enmax_acdndrawing_value ?? "";
    return {
      id: s.enmax_autocadsheetid,
      drawingId,
      drawingNumber: drawingNumberById.get(drawingId),
      sheetNumber: s.enmax_acdnsheetnumber,
      filename: s.enmax_acdnfilename,
      sharepointUrl: s.enmax_acdnsharepointurl,
      destinationUrl: s.enmax_acdnspdestinationurl,
      presentInDropOff: s.enmax_acdnpresentindropoff,
      presentInDestination: s.enmax_acdnpresentindestination,
      state: s.enmax_acdnstate,
      createdOn: s.createdon,
    };
  });

  sheets.sort((a, b) => {
    const numCmp = (a.drawingNumber ?? "").localeCompare(b.drawingNumber ?? "");
    if (numCmp !== 0) return numCmp;
    return (a.sheetNumber ?? 0) - (b.sheetNumber ?? 0);
  });

  const drawingIds = [...new Set(sheets.map((s) => s.drawingId).filter(isGuid))];
  if (drawingIds.length === 0) return sheets;

  const checkoutFilter = drawingIds.map((id) => `_enmax_acdndrawing_value eq '${id}'`).join(" or ");
  const checkoutsResult = await Enmax_autocadcheckoutsService.getAll({
    filter: `(${checkoutFilter})`,
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

  if (!checkoutsResult.success) {
    logDataverseError("ReservationSheetCheckouts", checkoutsResult.error);
    return sheets;
  }

  const bySheet = new Map<string, Record<string, unknown>[]>();
  for (const raw of (checkoutsResult.data ?? []) as unknown as Record<string, unknown>[]) {
    const sheetId = (raw["_enmax_acdnsheet_value"] as string | undefined) ?? "";
    if (!sheetId) continue;
    const list = bySheet.get(sheetId) ?? [];
    list.push(raw);
    bySheet.set(sheetId, list);
  }

  return sheets.map((sheet) => ({
    ...sheet,
    checkout: pickCheckout(bySheet.get(sheet.id) ?? []),
  }));
}

export function useReservationSheets(
  drawings: { id: string; number?: string }[],
  enabled: boolean,
) {
  const key = drawings.map((d) => d.id).sort().join(",");
  return useQuery({
    queryKey: ["reservation-sheets", key],
    queryFn: () => fetchReservationSheets(drawings),
    enabled: enabled && drawings.length > 0,
    staleTime: 30_000,
    throwOnError: false,
  });
}
