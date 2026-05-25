import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { Enmax_autocadreservationsService } from "../../generated";
import type { GridFetchParams } from "../../components/DataGrid";

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
  businessId: string;
  assetId: string;
  unitId: string;
  domainId: string;
  systemId: string;
  kindId: string;
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
};

export const RESERVATION_STATUS: Record<number, string> = {
  1: "Pending",
  2: "Approved",
  3: "Declined",
  4: "Cancelled",
};

function toMyReservation(r: RawReservation): MyReservation {
  const raw = r as RawReservation;
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
    approverDisplay:  raw["_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    businessId:       r._enmax_acdnbusiness_value ?? "",
    assetId:          r._enmax_acdnasset_value    ?? "",
    unitId:           r._enmax_acdnunit_value     ?? "",
    domainId:         r._enmax_acdndomain_value   ?? "",
    systemId:         r._enmax_acdnsystem_value   ?? "",
    kindId:           r._enmax_acdnkind_value     ?? "",
  };
}

const RESERVATION_SELECT = [
  "enmax_autocadreservationid", "enmax_acdnreservationid", "enmax_acdnstatus",
  "enmax_acdndrawingcount", "enmax_acdnissuednumbers", "enmax_acdnreason",
  "createdon", "enmax_acdnapprovedon",
  "_enmax_acdnapprover_value", "_enmax_acdnbusiness_value",
  "_enmax_acdnasset_value", "_enmax_acdnunit_value",
  "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
] as const;

export async function fetchMyReservationRows(
  userId: string,
  showFinalised: boolean,
  params: GridFetchParams,
): Promise<{ rows: MyReservation[]; totalCount: number }> {
  const activeFilter = `_ownerid_value eq '${userId}' and (enmax_acdnstatus eq 1 or enmax_acdnstatus eq 2)`;
  const filter = showFinalised ? `_ownerid_value eq '${userId}'` : activeFilter;

  const result = await Enmax_autocadreservationsService.getAll({
    filter,
    select:  [...RESERVATION_SELECT],
    orderBy: ["createdon desc"],
  });
  if (!result.success) throw new Error("My reservations fetch failed");
  let rows = (result.data ?? []).map(r => toMyReservation(r as RawReservation));

  if (params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter(r =>
      r.reservationNumber.toLowerCase().includes(q) ||
      r.statusLabel.toLowerCase().includes(q) ||
      r.approverDisplay.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q),
    );
  }

  if (params.sort) {
    const { column, direction } = params.sort;
    rows = [...rows].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[column];
      const bv = (b as unknown as Record<string, unknown>)[column];
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return direction === "asc" ? cmp : -cmp;
    });
  }

  const totalCount = rows.length;
  const start = params.page * params.pageSize;
  return { rows: rows.slice(start, start + params.pageSize), totalCount };
}

export function useMyReservations(showFinalised = false) {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey:     ["my-reservations", user?.id, showFinalised],
    enabled:      !!user?.id,
    throwOnError: false,
    queryFn: async () => {
      const activeFilter = `_ownerid_value eq '${user!.id}' and (enmax_acdnstatus eq 1 or enmax_acdnstatus eq 2)`;
      const filter = showFinalised
        ? `_ownerid_value eq '${user!.id}'`
        : activeFilter;

      const result = await Enmax_autocadreservationsService.getAll({
        filter,
        select:  [...RESERVATION_SELECT],
        orderBy: ["createdon desc"],
      });

      if (!result.success) throw new Error("My reservations fetch failed");
      return (result.data ?? []).map(r => toMyReservation(r as RawReservation));
    },
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
      qc.invalidateQueries({ queryKey: ["reservation-detail"] });
    },
  });
}
