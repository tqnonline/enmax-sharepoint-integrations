import { useQuery } from "@tanstack/react-query";
import { Enmax_autocaddrawingsService, Enmax_autocadcheckoutsService } from "../../../generated";
import type { DrawingForPanel, CheckoutForPanel, DrawingStateValue } from "../api/checkoutClient";
import { openCheckoutFilterForDrawings } from "../api/checkoutClient";

export interface ReservationDrawingRow {
  drawing: DrawingForPanel;
  checkout?: CheckoutForPanel;
}

async function fetchReservationDrawings(
  reservationId: string,
  targetDrawingId?: string,
): Promise<ReservationDrawingRow[]> {
  // Append reservations add sheets to an existing base owned by its original
  // reservation, so load that base by id rather than by this reservation.
  const drawingFilter = targetDrawingId
    ? `enmax_autocaddrawingid eq '${targetDrawingId}'`
    : `_enmax_acdnreservation_value eq '${reservationId}'`;
  const drawingsResult = await Enmax_autocaddrawingsService.getAll({
    filter: drawingFilter,
    select: [
      "enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdnstate",
      "enmax_acdnsplibraryurl", "enmax_acdncurrentrevision", "enmax_acdnmissingsheets",
      "_ownerid_value",
    ],
    orderBy: ["enmax_acdnnumber asc"],
  });

  if (!drawingsResult.success || !drawingsResult.data?.length) return [];

  const drawingIds = drawingsResult.data.map((d) => d.enmax_autocaddrawingid);

  const checkoutsResult = await Enmax_autocadcheckoutsService.getAll({
    filter: openCheckoutFilterForDrawings(drawingIds),
    select: [
      "enmax_autocadcheckoutid", "_enmax_acdndrawing_value",
      "_enmax_acdncheckedoutby_value", "enmax_acdnstatus",
      "enmax_acdnsubmissioninfo", "enmax_acdnnewpdfurls", "createdon",
    ],
  });

  const checkoutMap = new Map(
    (checkoutsResult.data ?? []).map((c) => [c._enmax_acdndrawing_value, c]),
  );

  return drawingsResult.data.map((d) => {
    const c = checkoutMap.get(d.enmax_autocaddrawingid);
    const draw = d as unknown as Record<string, unknown>;
    return {
      drawing: {
        id: d.enmax_autocaddrawingid,
        state: (d.enmax_acdnstate ?? 1) as DrawingStateValue,
        number: d.enmax_acdnnumber,
        spLibraryUrl: d.enmax_acdnsplibraryurl,
        currentRevision: d.enmax_acdncurrentrevision,
        missingSheets: d.enmax_acdnmissingsheets,
        ownerId: draw["_ownerid_value"] as string | undefined,
      },
      checkout: c
        ? {
            id: c.enmax_autocadcheckoutid,
            status: (c as unknown as Record<string, unknown>)["enmax_acdnstatus"] as number | undefined,
            checkedOutBy: c._enmax_acdncheckedoutby_value,
            checkedOutOn: c.createdon,
            submissionInfo: c.enmax_acdnsubmissioninfo,
            newPdfUrls: c.enmax_acdnnewpdfurls,
          }
        : undefined,
    };
  });
}

export function useReservationDrawings(reservationId: string | null, targetDrawingId?: string) {
  return useQuery<ReservationDrawingRow[]>({
    queryKey:        ["reservation-drawings", reservationId, targetDrawingId ?? ""],
    enabled:         !!reservationId,
    queryFn:         () => fetchReservationDrawings(reservationId!, targetDrawingId),
    refetchInterval: 30_000,
    throwOnError:    false,
  });
}
