import { Enmax_autocadreservationsService } from "../../../generated";
import type { Enmax_autocadreservationsBase } from "../../../generated/models/Enmax_autocadreservationsModel";
import { addChildItems } from "../../reserve/api/addChildItemsClient";
import { SEQUENCE_TYPE_EXISTING } from "../compositionUtils";

/** Re-run AddChildItems for an approved append reservation missing append range stamps. */
export async function retryAppendForReservation(reservationId: string): Promise<void> {
  const res = await Enmax_autocadreservationsService.get(reservationId, {
    select: [
      "enmax_acdndrawingcount", "enmax_acdnsequencetype",
      "_enmax_acdntargetdrawing_value", "enmax_acdnappendfirst",
    ],
  });
  if (!res.success || !res.data) {
    throw new Error("Reservation not found");
  }

  const r = res.data as typeof res.data & {
    enmax_acdnsequencetype?: number;
    _enmax_acdntargetdrawing_value?: string;
    enmax_acdnappendfirst?: number;
  };

  const isAppend = r.enmax_acdnsequencetype === SEQUENCE_TYPE_EXISTING
    && !!r._enmax_acdntargetdrawing_value;
  if (!isAppend) {
    throw new Error("This reservation is not an add-to-existing request.");
  }
  if (r.enmax_acdnappendfirst != null) {
    throw new Error("Child items were already appended for this reservation.");
  }

  const count = r.enmax_acdndrawingcount ?? 0;
  if (count < 1) {
    throw new Error("Reservation has no item count to append.");
  }

  const appendResult = await addChildItems({
    drawingId: r._enmax_acdntargetdrawing_value!,
    count,
  });

  const patchResult = await Enmax_autocadreservationsService.update(
    reservationId,
    {
      enmax_acdnappendfirst: appendResult.firstChildNumber,
      enmax_acdnappendlast:  appendResult.lastChildNumber,
    } as unknown as Partial<Omit<Enmax_autocadreservationsBase, "enmax_autocadreservationid">>,
  );
  if (!patchResult.success) {
    const err = patchResult.error as { message?: string } | undefined;
    throw new Error(
      `Items appended, but recording the range on the reservation failed: ${err?.message ?? "unknown error"}.`,
    );
  }
}
