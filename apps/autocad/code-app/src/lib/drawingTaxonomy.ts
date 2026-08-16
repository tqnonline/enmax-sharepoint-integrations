import { Enmax_autocadreservationsService } from "../generated";
import { drawingTypeDisplayLabel } from "../features/reserve/terminology";
import { isGuid } from "./guid";

export interface ReservationTaxonomy {
  enmax_acdnreservationtype?: number;
  enmax_acdndocumentsubtype?: number;
}

/** Batch-load reservation taxonomy for drawing type fallback (ADR 0001). */
export async function fetchReservationTaxonomyMap(
  reservationIds: string[],
): Promise<Map<string, ReservationTaxonomy>> {
  const unique = [...new Set(reservationIds.filter(isGuid))];
  const map = new Map<string, ReservationTaxonomy>();
  if (unique.length === 0) return map;

  const filter = unique.map((id) => `enmax_autocadreservationid eq '${id}'`).join(" or ");
  const res = await Enmax_autocadreservationsService.getAll({
    filter: `(${filter})`,
    select: ["enmax_autocadreservationid", "enmax_acdnreservationtype", "enmax_acdndocumentsubtype"],
  });
  for (const row of res.data ?? []) {
    const r = row as typeof row & {
      enmax_acdnreservationtype?: number;
      enmax_acdndocumentsubtype?: number;
    };
    map.set(r.enmax_autocadreservationid, {
      enmax_acdnreservationtype: r.enmax_acdnreservationtype,
      enmax_acdndocumentsubtype: r.enmax_acdndocumentsubtype,
    });
  }
  return map;
}

export function typeLabelForDrawingRow(
  drawing: Record<string, unknown>,
  reservationMap: Map<string, ReservationTaxonomy>,
): string {
  const reservationId = drawing["_enmax_acdnreservation_value"] as string | undefined;
  const reservation = reservationId ? reservationMap.get(reservationId) : undefined;
  return drawingTypeDisplayLabel(
    {
      enmax_acdnreservationtype: drawing["enmax_acdnreservationtype"] as number | undefined,
      enmax_acdndocumentsubtype: drawing["enmax_acdndocumentsubtype"] as number | undefined,
    },
    reservation,
  );
}
