import { useQuery } from "@tanstack/react-query";
import { Enmax_autocaddrawingsService, Enmax_autocadcheckoutsService } from "../../../generated";
import type { DrawingForPanel, CheckoutForPanel, DrawingStateValue } from "../api/checkoutClient";

export interface ReservationDrawingRow {
  drawing: DrawingForPanel;
  checkout?: CheckoutForPanel;
}

async function fetchReservationDrawings(reservationId: string): Promise<ReservationDrawingRow[]> {
  const drawingsResult = await Enmax_autocaddrawingsService.getAll({
    filter: `_enmax_acdnreservation_value eq '${reservationId}'`,
    select: [
      "enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdnstate",
      "enmax_acdnsplibraryurl", "enmax_acdncurrentrevision", "enmax_acdnmissingsheets",
    ],
    orderBy: ["enmax_acdnnumber asc"],
  });

  if (!drawingsResult.success || !drawingsResult.data?.length) return [];

  const drawingIds = drawingsResult.data.map((d) => d.enmax_autocaddrawingid);

  const checkoutsResult = await Enmax_autocadcheckoutsService.getAll({
    filter:
      "(" + drawingIds.map((id) => `_enmax_acdndrawing_value eq '${id}'`).join(" or ") + ")" +
      " and enmax_acdnstatus lt 3",
    select: [
      "enmax_autocadcheckoutid", "_enmax_acdndrawing_value",
      "_enmax_acdncheckedoutby_value", "enmax_acdnstatus",
      "enmax_acdnnewrevision", "enmax_acdnnewpdfurls", "createdon",
    ],
  });

  const checkoutMap = new Map(
    (checkoutsResult.data ?? []).map((c) => [c._enmax_acdndrawing_value, c]),
  );

  return drawingsResult.data.map((d) => {
    const c = checkoutMap.get(d.enmax_autocaddrawingid);
    return {
      drawing: {
        id: d.enmax_autocaddrawingid,
        state: (d.enmax_acdnstate ?? 1) as DrawingStateValue,
        number: d.enmax_acdnnumber,
        spLibraryUrl: d.enmax_acdnsplibraryurl,
        currentRevision: d.enmax_acdncurrentrevision,
        missingSheets: d.enmax_acdnmissingsheets,
      },
      checkout: c
        ? {
            id: c.enmax_autocadcheckoutid,
            checkedOutBy: c._enmax_acdncheckedoutby_value,
            checkedOutOn: c.createdon,
            newRevision: c.enmax_acdnnewrevision,
            newPdfUrls: c.enmax_acdnnewpdfurls,
          }
        : undefined,
    };
  });
}

export function useReservationDrawings(reservationId: string | null) {
  return useQuery<ReservationDrawingRow[]>({
    queryKey:        ["reservation-drawings", reservationId],
    enabled:         !!reservationId,
    queryFn:         () => fetchReservationDrawings(reservationId!),
    refetchInterval: 30_000,
    throwOnError:    false,
  });
}
