import { useQuery } from "@tanstack/react-query";
import { Enmax_autocadsheetsService } from "../../../generated";

/** Sheet state option set — Available = 2 (see sheet_state.yaml). */
export const SHEET_STATE_AVAILABLE = 2;
export const SHEET_STATE_CHECKED_OUT = 3;
export const SHEET_STATE_AWAITING_VALIDATION = 4;

export const SHEET_STATE_LABELS: Record<number, string> = {
  0: "None",
  1: "Pending Initial Upload",
  2: "Available",
  3: "Checked Out",
  4: "Awaiting Validation",
  5: "Obsolete",
  6: "Void",
};

export const NEW_SHEET_DAYS = 7;

export interface SheetDetail {
  id: string;
  sheetNumber?: number;
  filename?: string;
  sharepointUrl?: string;
  destinationUrl?: string;
  presentInDropOff?: boolean;
  presentInDestination?: boolean;
  state?: number;
  createdOn?: string;
}

async function fetchSheets(drawingId: string): Promise<SheetDetail[]> {
  const result = await Enmax_autocadsheetsService.getAll({
    filter: `_enmax_acdndrawing_value eq ${drawingId}`,
    select: [
      "enmax_autocadsheetid", "_enmax_acdndrawing_value",
      "enmax_acdnsheetnumber", "enmax_acdnfilename", "enmax_acdnsharepointurl",
      "enmax_acdnspdestinationurl", "enmax_acdnpresentindropoff", "enmax_acdnpresentindestination",
      "enmax_acdnstate", "createdon",
    ],
    orderBy: ["enmax_acdnsheetnumber asc"],
  });
  return (result.data ?? []).map(s => ({
    id: s.enmax_autocadsheetid,
    sheetNumber: s.enmax_acdnsheetnumber,
    filename: s.enmax_acdnfilename,
    sharepointUrl: s.enmax_acdnsharepointurl,
    destinationUrl: s.enmax_acdnspdestinationurl,
    presentInDropOff: s.enmax_acdnpresentindropoff,
    presentInDestination: s.enmax_acdnpresentindestination,
    state: s.enmax_acdnstate,
    createdOn: s.createdon,
  }));
}

export function useDrawingSheets(drawingId: string, enabled: boolean) {
  return useQuery<SheetDetail[]>({
    queryKey: ["drawing-sheets", drawingId],
    queryFn:  () => fetchSheets(drawingId),
    enabled,
    staleTime: 5 * 60_000,
    throwOnError: false,
  });
}
