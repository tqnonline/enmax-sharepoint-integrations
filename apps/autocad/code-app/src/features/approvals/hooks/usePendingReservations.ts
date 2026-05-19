import { useQuery } from "@tanstack/react-query";

export interface PendingReservation {
  enmax_acdnreservationid: string;
  enmax_acdnreservationnumber: string;
  _createdby_value: string;
  _createdby_value_Formatted: string;
  enmax_acdndrawingcount: number;
  enmax_acdnoverride: boolean;
  enmax_acdnreason: string;
  enmax_acdnstatus: number;
  createdon: string;
  // lookup-expanded codes (fetched via $expand or separate query)
  businessCode?: string;
  assetCode?:    string;
  unitCode?:     string;
  domainCode?:   string;
  systemCode?:   string;
  kindCode?:     string;
}

async function fetchPendingReservations(): Promise<PendingReservation[]> {
  const base = (window as unknown as Record<string, string>).__dataverseBaseUrl ??
    "/api/data/v9.2";

  const res = await fetch(
    `${base}/enmax_autocadreservations` +
    `?$filter=enmax_acdnstatus eq 1` +
    `&$select=enmax_acdnreservationid,enmax_acdnreservationnumber,_createdby_value,enmax_acdndrawingcount,enmax_acdnoverride,enmax_acdnreason,enmax_acdnstatus,createdon` +
    `&$expand=enmax_acdnbusiness($select=enmax_acdncode),enmax_acdnasset($select=enmax_acdncode),enmax_acdnunit($select=enmax_acdncode),enmax_acdndomain($select=enmax_acdncode),enmax_acdnsystem($select=enmax_acdncode),enmax_acdnkind($select=enmax_acdncode)` +
    `&$orderby=createdon desc`,
    {
      headers: {
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Prefer: "odata.include-annotations=OData.Community.Display.V1.FormattedValue",
      },
    },
  );

  if (!res.ok) throw new Error(`Pending reservations fetch failed: ${res.status}`);

  interface RawRow {
    enmax_acdnreservationid: string;
    enmax_acdnreservationnumber: string;
    _createdby_value: string;
    "_createdby_value@OData.Community.Display.V1.FormattedValue"?: string;
    enmax_acdndrawingcount: number;
    enmax_acdnoverride: boolean;
    enmax_acdnreason: string;
    enmax_acdnstatus: number;
    createdon: string;
    enmax_acdnbusiness?: { enmax_acdncode: string };
    enmax_acdnasset?:    { enmax_acdncode: string };
    enmax_acdnunit?:     { enmax_acdncode: string };
    enmax_acdndomain?:   { enmax_acdncode: string };
    enmax_acdnsystem?:   { enmax_acdncode: string };
    enmax_acdnkind?:     { enmax_acdncode: string };
  }

  const json = await res.json() as { value: RawRow[] };
  return json.value.map((r) => ({
    enmax_acdnreservationid:         r.enmax_acdnreservationid,
    enmax_acdnreservationnumber:     r.enmax_acdnreservationnumber,
    _createdby_value:                r._createdby_value,
    _createdby_value_Formatted:      r["_createdby_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    enmax_acdndrawingcount:          r.enmax_acdndrawingcount,
    enmax_acdnoverride:              r.enmax_acdnoverride,
    enmax_acdnreason:                r.enmax_acdnreason,
    enmax_acdnstatus:                r.enmax_acdnstatus,
    createdon:                       r.createdon,
    businessCode:                    r.enmax_acdnbusiness?.enmax_acdncode,
    assetCode:                       r.enmax_acdnasset?.enmax_acdncode,
    unitCode:                        r.enmax_acdnunit?.enmax_acdncode,
    domainCode:                      r.enmax_acdndomain?.enmax_acdncode,
    systemCode:                      r.enmax_acdnsystem?.enmax_acdncode,
    kindCode:                        r.enmax_acdnkind?.enmax_acdncode,
  }));
}

export function usePendingReservations() {
  return useQuery<PendingReservation[]>({
    queryKey: ["pending-reservations"],
    queryFn:  fetchPendingReservations,
    refetchInterval: 30_000,
  });
}
