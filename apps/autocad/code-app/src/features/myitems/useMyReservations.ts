import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Enmax_autocadreservationsService } from "../../generated";
import type { GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { logDataverseError } from "../../components/DataGrid/dataverseError";
import { isGuid } from "../../lib/guid";
import { reservationTypeDisplayLabel } from "../reserve/terminology";

export interface MyReservation {
  id: string;
  reservationNumber: string;
  status: number;
  statusLabel: string;
  drawingCount: number;
  issuedNumbers: string;
  reason: string;
  createdOn: string;
  approvedOn: string;
  approverDisplay: string;
  /** Reservation submitter — "Reserved for" on Home. */
  submitterDisplay: string;
  businessId: string;
  assetId: string;
  unitId: string;
  domainId: string;
  systemId: string;
  kindId: string;
  typeLabel: string;
  sequenceType?: number;
  targetDrawingId?: string;
  targetDrawingNumber?: string;
  appendFirst?: number;
  appendLast?: number;
}

type RawReservation = {
  enmax_autocadreservationid: string;
  enmax_acdnreservationid?: string;
  enmax_acdnstatus?: number;
  enmax_acdndrawingcount?: number;
  enmax_acdnissuednumbers?: string;
  enmax_acdnreason?: string;
  createdon?: string;
  enmax_acdnapprovedon?: string;
  _enmax_acdnapprover_value?: string;
  "_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"?: string;
  _createdby_value?: string;
  "_createdby_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnbusiness_value?: string;
  "_enmax_acdnbusiness_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnasset_value?: string;
  "_enmax_acdnasset_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnunit_value?: string;
  "_enmax_acdnunit_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdndomain_value?: string;
  "_enmax_acdndomain_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnsystem_value?: string;
  "_enmax_acdnsystem_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnkind_value?: string;
  "_enmax_acdnkind_value@OData.Community.Display.V1.FormattedValue"?: string;
  enmax_acdnreservationtype?: number;
  enmax_acdndocumentsubtype?: number;
  enmax_acdnsequencetype?: number;
  _enmax_acdntargetdrawing_value?: string;
  enmax_acdnappendfirst?: number;
  enmax_acdnappendlast?: number;
};

export const RESERVATION_STATUS: Record<number, string> = {
  1: "Pending",
  2: "Approved",
  3: "Declined",
  4: "Cancelled",
};

function toMyReservation(r: RawReservation): MyReservation {
  const status = r.enmax_acdnstatus ?? 1;

  return {
    id:               r.enmax_autocadreservationid,
    reservationNumber:r.enmax_acdnreservationid ?? "",
    status,
    statusLabel:      RESERVATION_STATUS[status] ?? String(status),
    drawingCount:     r.enmax_acdndrawingcount ?? 0,
    issuedNumbers:    r.enmax_acdnissuednumbers ?? "",
    reason:           r.enmax_acdnreason ?? "",
    createdOn:        r.createdon ?? "",
    approvedOn:       r.enmax_acdnapprovedon ?? "",
    approverDisplay:  r["_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    submitterDisplay: r["_createdby_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    businessId:       r._enmax_acdnbusiness_value ?? "",
    assetId:          r._enmax_acdnasset_value    ?? "",
    unitId:           r._enmax_acdnunit_value     ?? "",
    domainId:         r._enmax_acdndomain_value   ?? "",
    systemId:         r._enmax_acdnsystem_value   ?? "",
    kindId:           r._enmax_acdnkind_value     ?? "",
    typeLabel:        reservationTypeDisplayLabel(r.enmax_acdnreservationtype, r.enmax_acdndocumentsubtype),
    sequenceType:     r.enmax_acdnsequencetype,
    targetDrawingId:  r._enmax_acdntargetdrawing_value,
    appendFirst:      r.enmax_acdnappendfirst,
    appendLast:       r.enmax_acdnappendlast,
  };
}

const RESERVATION_SELECT = [
  "enmax_autocadreservationid", "enmax_acdnreservationid", "enmax_acdnstatus",
  "enmax_acdndrawingcount", "enmax_acdnissuednumbers", "enmax_acdnreason",
  "createdon", "enmax_acdnapprovedon",
  "_createdby_value", "_enmax_acdnapprover_value", "_enmax_acdnbusiness_value",
  "_enmax_acdnasset_value", "_enmax_acdnunit_value",
  "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
  "enmax_acdnreservationtype", "enmax_acdndocumentsubtype",
  "enmax_acdnsequencetype", "_enmax_acdntargetdrawing_value",
  "enmax_acdnappendfirst", "enmax_acdnappendlast",
] as const;

export async function fetchMyReservationRows(
  userId: string,
  showFinalised: boolean,
  params: GridFetchParams,
): Promise<{ rows: MyReservation[]; totalCount: number }> {
  // The owner filter is the only data-isolation control here; validate the id is a
  // GUID before interpolating it so a malformed value can't widen the OData filter.
  if (!isGuid(userId)) {
    logDataverseError("MyReservations", new Error(`invalid userId: ${userId}`));
    return { rows: [], totalCount: 0 };
  }
  const activeFilter = `_createdby_value eq '${userId}' and (enmax_acdnstatus eq 1 or enmax_acdnstatus eq 2)`;
  const filter = showFinalised ? `_createdby_value eq '${userId}'` : activeFilter;

  const result = await Enmax_autocadreservationsService.getAll({
    filter,
    select:  [...RESERVATION_SELECT],
    orderBy: ["createdon desc"],
  });
  if (!result.success) {
    logDataverseError("MyReservations", result.error);
    throw new Error("My reservations fetch failed");
  }
  const rows = (result.data ?? []).map(r => toMyReservation(r as RawReservation));

  return clientPage(rows, params, {
    searchText: r => [
      r.reservationNumber, r.statusLabel, r.typeLabel, r.approverDisplay,
      r.submitterDisplay, r.reason,
    ],
  });
}

export function useCancelReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reservationId: string) => {
      await Enmax_autocadreservationsService.update(reservationId, {
        enmax_acdnstatus: 4, // Cancelled
      } as Parameters<typeof Enmax_autocadreservationsService.update>[1]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-reservations"] });
      qc.invalidateQueries({ queryKey: ["home-my-reservations"] });
      qc.invalidateQueries({ queryKey: ["reservation-detail"] });
    },
    onError: (e, reservationId) =>
      logDataverseError("CancelReservation", e, undefined, {
        subjectTable: "enmax_autocadreservation",
        subjectId: reservationId,
      }),
  });
}
