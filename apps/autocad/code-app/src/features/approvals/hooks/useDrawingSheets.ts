import { useQuery } from "@tanstack/react-query";
import { Enmax_autocadsheetsService } from "../../../generated";

export interface SheetDetail {
  id: string;
  sheetNumber?: number;
  filename?: string;
  sharepointUrl?: string;
}

async function fetchSheets(drawingId: string): Promise<SheetDetail[]> {
  const result = await Enmax_autocadsheetsService.getAll({
    filter: `_enmax_acdndrawing_value eq ${drawingId}`,
    select: [
      "enmax_autocadsheetid", "_enmax_acdndrawing_value",
      "enmax_acdnsheetnumber", "enmax_acdnfilename", "enmax_acdnsharepointurl",
    ],
    orderBy: ["enmax_acdnsheetnumber asc"],
  });
  return (result.data ?? []).map(s => ({
    id: s.enmax_autocadsheetid,
    sheetNumber: s.enmax_acdnsheetnumber,
    filename: s.enmax_acdnfilename,
    sharepointUrl: s.enmax_acdnsharepointurl,
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
