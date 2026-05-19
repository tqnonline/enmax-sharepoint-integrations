import { useQuery } from "@tanstack/react-query";

export interface AuditEvent {
  enmax_acdnauditeventid: string;
  enmax_acdnevent: number;
  enmax_acdnevent_Formatted: string;
  _modifiedby_value_Formatted: string;
  modifiedon: string;
}

async function fetchAuditEvents(reservationId: string): Promise<AuditEvent[]> {
  const base = (window as unknown as Record<string, string>).__dataverseBaseUrl ??
    "/api/data/v9.2";

  const res = await fetch(
    `${base}/enmax_autocadauditevents` +
    `?$filter=_enmax_acdnsubjectreservation_value eq '${reservationId}'` +
    `&$select=enmax_acdnauditeventid,enmax_acdnevent,modifiedon,_modifiedby_value` +
    `&$orderby=modifiedon desc`,
    {
      headers: {
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Prefer: "odata.include-annotations=OData.Community.Display.V1.FormattedValue",
      },
    },
  );
  if (!res.ok) throw new Error(`Audit events fetch failed: ${res.status}`);

  interface RawAudit {
    enmax_acdnauditeventid: string;
    enmax_acdnevent: number;
    "enmax_acdnevent@OData.Community.Display.V1.FormattedValue"?: string;
    "_modifiedby_value@OData.Community.Display.V1.FormattedValue"?: string;
    modifiedon: string;
  }

  const json = await res.json() as { value: RawAudit[] };
  return json.value.map((r) => ({
    enmax_acdnauditeventid:      r.enmax_acdnauditeventid,
    enmax_acdnevent:             r.enmax_acdnevent,
    enmax_acdnevent_Formatted:   r["enmax_acdnevent@OData.Community.Display.V1.FormattedValue"] ?? String(r.enmax_acdnevent),
    _modifiedby_value_Formatted: r["_modifiedby_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    modifiedon:                  r.modifiedon,
  }));
}

export function useApprovalAudit(reservationId: string | null) {
  return useQuery<AuditEvent[]>({
    queryKey: ["approval-audit", reservationId],
    queryFn: () => fetchAuditEvents(reservationId!),
    enabled: !!reservationId,
  });
}
