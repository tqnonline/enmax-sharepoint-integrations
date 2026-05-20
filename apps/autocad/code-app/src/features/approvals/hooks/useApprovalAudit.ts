import { useQuery } from "@tanstack/react-query";
import { Enmax_autocadauditeventsService } from "../../../generated";
import type { Enmax_autocadauditevents } from "../../../generated/models/Enmax_autocadauditeventsModel";

export interface AuditEvent {
  enmax_acdnauditeventid: string;
  enmax_acdnevent: number;
  enmax_acdnevent_Formatted: string;
  actedBy_Formatted: string;
  createdon: string;
}

type RawWithAnnotations = Enmax_autocadauditevents & {
  "enmax_acdnevent@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdnactedby_value@OData.Community.Display.V1.FormattedValue"?: string;
};

async function fetchAuditEvents(reservationId: string): Promise<AuditEvent[]> {
  const res = await Enmax_autocadauditeventsService.getAll({
    filter:  `enmax_acdnsubjectid eq '${reservationId}'`,
    select:  ["enmax_autocadauditeventid", "enmax_acdnevent", "createdon", "_enmax_acdnactedby_value"],
    orderBy: ["createdon asc"],
  });

  if (!res.success) throw new Error("Audit events fetch failed");

  return (res.data ?? []).map((r) => {
    const raw = r as RawWithAnnotations;
    return {
      enmax_acdnauditeventid: r.enmax_autocadauditeventid,
      enmax_acdnevent:        r.enmax_acdnevent ?? 0,
      enmax_acdnevent_Formatted:
        raw["enmax_acdnevent@OData.Community.Display.V1.FormattedValue"] ?? String(r.enmax_acdnevent ?? ""),
      actedBy_Formatted:
        raw["_enmax_acdnactedby_value@OData.Community.Display.V1.FormattedValue"] ?? "",
      createdon: r.createdon ?? "",
    };
  });
}

export function useApprovalAudit(reservationId: string | null) {
  return useQuery<AuditEvent[]>({
    queryKey:     ["approval-audit", reservationId],
    queryFn:      () => fetchAuditEvents(reservationId!),
    enabled:      !!reservationId,
    throwOnError: false,
  });
}
