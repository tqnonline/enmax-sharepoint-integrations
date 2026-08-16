import type { ApproveInput } from "./hooks/useApproveReservation";
import type { PendingReservation } from "./hooks/usePendingReservations";

/** Build approve/decline payload from a queue row (single or bulk approve). */
export function approveInputFromReservation(
  r: PendingReservation,
  decision: "Approved" | "Declined",
  reason?: string,
): ApproveInput {
  if (decision === "Declined") {
    return { reservationId: r.enmax_acdnreservationid, decision, reason };
  }
  if (r.isAppend) {
    return {
      reservationId:   r.enmax_acdnreservationid,
      decision:        "Approved",
      drawingCount:    r.enmax_acdndrawingcount,
      sequenceType:    r.sequenceType,
      reservationType: r.reservationType,
      targetDrawingId: r.targetDrawingId,
    };
  }
  return {
    reservationId: r.enmax_acdnreservationid,
    decision:      "Approved",
    businessCode:  r.businessCode,
    assetCode:     r.assetCode,
    unitCode:      r.unitCode,
    domainCode:    r.domainCode,
    systemCode:    r.systemCode,
    kindCode:      r.kindCode,
    drawingCount:  r.enmax_acdndrawingcount,
  };
}
