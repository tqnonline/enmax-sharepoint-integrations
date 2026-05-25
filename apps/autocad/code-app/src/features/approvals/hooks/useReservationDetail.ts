import { useQuery } from "@tanstack/react-query";
import {
  Enmax_autocadreservationsService,
  Enmax_autocaddrawingsService,
  Enmax_autocadbusinessesService,
  Enmax_autocadassetsService,
  Enmax_autocadunitsService,
  Enmax_autocaddomainsService,
  Enmax_autocadsystemsService,
  Enmax_autocadkindsService,
  SystemusersService,
} from "../../../generated";

export interface DrawingDetail {
  id: string;
  number?: string;
  state: number;
  currentRevision?: string;
  spLibraryUrl?: string;
}

export interface ReservationDetail {
  id: string;
  number: string;
  status: number;
  drawingCount: number;
  reason: string;
  declineReason?: string;
  createdon: string;
  override: boolean;
  issuedNumbers?: string;
  submitterId?: string;
  submitterName?: string;
  submitterJobTitle?: string;
  businessCode?: string;
  assetCode?: string;
  unitCode?: string;
  domainCode?: string;
  systemCode?: string;
  kindCode?: string;
  businessName?: string;
  assetName?: string;
  unitName?: string;
  domainName?: string;
  systemName?: string;
  kindName?: string;
  drawings: DrawingDetail[];
}

async function fetchReservationDetail(reservationId: string): Promise<ReservationDetail> {
  const resResult = await Enmax_autocadreservationsService.get(reservationId, {
    select: [
      "enmax_autocadreservationid", "enmax_acdnreservationid",
      "enmax_acdnstatus", "enmax_acdndrawingcount",
      "enmax_acdnreason", "enmax_acdndeclinereason", "createdon",
      "enmax_acdnoverride", "enmax_acdnissuednumbers",
      "_createdby_value",
      "_enmax_acdnbusiness_value", "_enmax_acdnasset_value",
      "_enmax_acdnunit_value", "_enmax_acdndomain_value",
      "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
    ],
  });

  if (!resResult.success || !resResult.data) throw new Error("Reservation not found");
  const r = resResult.data;

  // Parallel: drawings + all lookup tables (lookup fields use bare GUID, no quotes)
  const [
    drawingsResult,
    bizRes, assetRes, unitRes, domainRes, sysRes, kindRes,
  ] = await Promise.allSettled([
    Enmax_autocaddrawingsService.getAll({
      filter: `_enmax_acdnreservation_value eq ${reservationId}`,
      select: [
        "enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdnstate",
        "enmax_acdncurrentrevision", "enmax_acdnsplibraryurl",
      ],
      orderBy: ["enmax_acdnnumber asc"],
    }),
    Enmax_autocadbusinessesService.getAll({ select: ["enmax_autocadbusinessid", "enmax_acdncode", "enmax_acdndisplayname"] }),
    Enmax_autocadassetsService.getAll({ select: ["enmax_autocadassetid",       "enmax_acdncode", "enmax_acdndisplayname"] }),
    Enmax_autocadunitsService.getAll({ select: ["enmax_autocadunitid",         "enmax_acdncode", "enmax_acdndisplayname"] }),
    Enmax_autocaddomainsService.getAll({ select: ["enmax_autocaddomainid",     "enmax_acdncode", "enmax_acdndisplayname"] }),
    Enmax_autocadsystemsService.getAll({ select: ["enmax_autocadsystemid",     "enmax_acdncode", "enmax_acdndisplayname"] }),
    Enmax_autocadkindsService.getAll({ select: ["enmax_autocadkindid",         "enmax_acdncode", "enmax_acdndisplayname"] }),
  ]);

  const biz    = bizRes.status    === "fulfilled" ? bizRes.value    : null;
  const asset  = assetRes.status  === "fulfilled" ? assetRes.value  : null;
  const unit   = unitRes.status   === "fulfilled" ? unitRes.value   : null;
  const domain = domainRes.status === "fulfilled" ? domainRes.value : null;
  const sys    = sysRes.status    === "fulfilled" ? sysRes.value    : null;
  const kind   = kindRes.status   === "fulfilled" ? kindRes.value   : null;

  const bizMap       = new Map(biz?.data?.map(x => [x.enmax_autocadbusinessid, x.enmax_acdncode]) ?? []);
  const assetMap     = new Map(asset?.data?.map(x => [x.enmax_autocadassetid,  x.enmax_acdncode]) ?? []);
  const unitMap      = new Map(unit?.data?.map(x => [x.enmax_autocadunitid,    x.enmax_acdncode]) ?? []);
  const domainMap    = new Map(domain?.data?.map(x => [x.enmax_autocaddomainid,x.enmax_acdncode]) ?? []);
  const sysMap       = new Map(sys?.data?.map(x => [x.enmax_autocadsystemid,   x.enmax_acdncode]) ?? []);
  const kindMap      = new Map(kind?.data?.map(x => [x.enmax_autocadkindid,    x.enmax_acdncode]) ?? []);

  const bizNameMap    = new Map(biz?.data?.map(x => [x.enmax_autocadbusinessid, x.enmax_acdndisplayname]) ?? []);
  const assetNameMap  = new Map(asset?.data?.map(x => [x.enmax_autocadassetid,  x.enmax_acdndisplayname]) ?? []);
  const unitNameMap   = new Map(unit?.data?.map(x => [x.enmax_autocadunitid,    x.enmax_acdndisplayname]) ?? []);
  const domainNameMap = new Map(domain?.data?.map(x => [x.enmax_autocaddomainid,x.enmax_acdndisplayname]) ?? []);
  const sysNameMap    = new Map(sys?.data?.map(x => [x.enmax_autocadsystemid,   x.enmax_acdndisplayname]) ?? []);
  const kindNameMap   = new Map(kind?.data?.map(x => [x.enmax_autocadkindid,    x.enmax_acdndisplayname]) ?? []);

  // Submitter: sequential, non-fatal
  let submitter: { fullname?: string | null; jobtitle?: string | null } | undefined;
  if (r._createdby_value) {
    try {
      const sub = await SystemusersService.getAll({
        select: ["systemuserid", "fullname", "jobtitle"],
        filter: `systemuserid eq '${r._createdby_value}'`,
      });
      submitter = sub.data?.[0];
    } catch { /* non-fatal */ }
  }

  const drawings = drawingsResult.status === "fulfilled" ? (drawingsResult.value.data ?? []) : [];

  return {
    id: r.enmax_autocadreservationid,
    number: r.enmax_acdnreservationid ?? r.enmax_autocadreservationid,
    status: r.enmax_acdnstatus ?? 1,
    drawingCount: r.enmax_acdndrawingcount ?? 0,
    reason: r.enmax_acdnreason ?? "",
    declineReason: r.enmax_acdndeclinereason,
    createdon: r.createdon ?? "",
    override: r.enmax_acdnoverride ?? false,
    issuedNumbers: r.enmax_acdnissuednumbers,
    submitterId: r._createdby_value ?? undefined,
    submitterName: submitter?.fullname ?? undefined,
    submitterJobTitle: submitter?.jobtitle ?? undefined,
    businessCode: r._enmax_acdnbusiness_value ? bizMap.get(r._enmax_acdnbusiness_value)       : undefined,
    assetCode:    r._enmax_acdnasset_value    ? assetMap.get(r._enmax_acdnasset_value)         : undefined,
    unitCode:     r._enmax_acdnunit_value     ? unitMap.get(r._enmax_acdnunit_value)           : undefined,
    domainCode:   r._enmax_acdndomain_value   ? domainMap.get(r._enmax_acdndomain_value)       : undefined,
    systemCode:   r._enmax_acdnsystem_value   ? sysMap.get(r._enmax_acdnsystem_value)          : undefined,
    kindCode:     r._enmax_acdnkind_value     ? kindMap.get(r._enmax_acdnkind_value)           : undefined,
    businessName: r._enmax_acdnbusiness_value ? bizNameMap.get(r._enmax_acdnbusiness_value)    : undefined,
    assetName:    r._enmax_acdnasset_value    ? assetNameMap.get(r._enmax_acdnasset_value)     : undefined,
    unitName:     r._enmax_acdnunit_value     ? unitNameMap.get(r._enmax_acdnunit_value)       : undefined,
    domainName:   r._enmax_acdndomain_value   ? domainNameMap.get(r._enmax_acdndomain_value)   : undefined,
    systemName:   r._enmax_acdnsystem_value   ? sysNameMap.get(r._enmax_acdnsystem_value)      : undefined,
    kindName:     r._enmax_acdnkind_value     ? kindNameMap.get(r._enmax_acdnkind_value)       : undefined,
    drawings: drawings.map(d => ({
      id: d.enmax_autocaddrawingid,
      number: d.enmax_acdnnumber,
      state: d.enmax_acdnstate ?? 1,
      currentRevision: d.enmax_acdncurrentrevision,
      spLibraryUrl: d.enmax_acdnsplibraryurl,
    })),
  };
}

export function useReservationDetail(reservationId: string | undefined) {
  return useQuery<ReservationDetail>({
    queryKey:    ["reservation-detail", reservationId],
    enabled:     !!reservationId,
    queryFn:     () => fetchReservationDetail(reservationId!),
    throwOnError: false,
  });
}
