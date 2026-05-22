import { useQuery } from "@tanstack/react-query";
import {
  Enmax_autocadreservationsService,
  Enmax_autocadbusinessesService,
  Enmax_autocadassetsService,
  Enmax_autocadunitsService,
  Enmax_autocaddomainsService,
  Enmax_autocadsystemsService,
  Enmax_autocadkindsService,
  SystemusersService,
} from "../../../generated";
import type { PendingReservation } from "./usePendingReservations";

async function fetchMyReservations(userId: string): Promise<PendingReservation[]> {
  const res = await Enmax_autocadreservationsService.getAll({
    filter: `_createdby_value eq ${userId}`,
    select: [
      "enmax_autocadreservationid", "enmax_acdnreservationid", "_createdby_value",
      "enmax_acdndrawingcount", "enmax_acdnoverride", "enmax_acdnreason",
      "enmax_acdnstatus", "enmax_acdndeclinereason", "enmax_acdnissuednumbers", "createdon",
      "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
      "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
    ],
    orderBy: ["createdon desc"],
  });

  if (!res.success) throw new Error("My reservations fetch failed");

  // Lookup tables may not be readable by regular users — degrade gracefully to empty maps.
  const [bizRes, assetRes, unitRes, domainRes, sysRes, kindRes] = await Promise.allSettled([
    Enmax_autocadbusinessesService.getAll({ select: ["enmax_autocadbusinessid", "enmax_acdncode"] }),
    Enmax_autocadassetsService.getAll({ select: ["enmax_autocadassetid", "enmax_acdncode"] }),
    Enmax_autocadunitsService.getAll({ select: ["enmax_autocadunitid", "enmax_acdncode"] }),
    Enmax_autocaddomainsService.getAll({ select: ["enmax_autocaddomainid", "enmax_acdncode"] }),
    Enmax_autocadsystemsService.getAll({ select: ["enmax_autocadsystemid", "enmax_acdncode"] }),
    Enmax_autocadkindsService.getAll({ select: ["enmax_autocadkindid", "enmax_acdncode"] }),
  ]);

  const biz    = bizRes.status    === "fulfilled" ? bizRes.value    : null;
  const asset  = assetRes.status  === "fulfilled" ? assetRes.value  : null;
  const unit   = unitRes.status   === "fulfilled" ? unitRes.value   : null;
  const domain = domainRes.status === "fulfilled" ? domainRes.value : null;
  const sys    = sysRes.status    === "fulfilled" ? sysRes.value    : null;
  const kind   = kindRes.status   === "fulfilled" ? kindRes.value   : null;

  const bizMap    = new Map(biz?.data?.map(r    => [r.enmax_autocadbusinessid, r.enmax_acdncode]) ?? []);
  const assetMap  = new Map(asset?.data?.map(r  => [r.enmax_autocadassetid,   r.enmax_acdncode]) ?? []);
  const unitMap   = new Map(unit?.data?.map(r   => [r.enmax_autocadunitid,    r.enmax_acdncode]) ?? []);
  const domainMap = new Map(domain?.data?.map(r => [r.enmax_autocaddomainid,  r.enmax_acdncode]) ?? []);
  const sysMap    = new Map(sys?.data?.map(r    => [r.enmax_autocadsystemid,  r.enmax_acdncode]) ?? []);
  const kindMap   = new Map(kind?.data?.map(r   => [r.enmax_autocadkindid,    r.enmax_acdncode]) ?? []);

  let user: { fullname?: string; jobtitle?: string } | undefined;
  try {
    const usersRes = await SystemusersService.getAll({
      select: ["systemuserid", "fullname", "jobtitle"],
      filter: `systemuserid eq '${userId}'`,
    });
    user = usersRes.data?.[0];
  } catch {
    // non-fatal — display name will fall back to userId
  }

  return res.data!.map((r) => ({
    enmax_acdnreservationid:     r.enmax_autocadreservationid,
    enmax_acdnreservationnumber: r.enmax_acdnreservationid ?? "",
    _createdby_value:            r._createdby_value ?? "",
    _createdby_value_Formatted:  user?.fullname ?? r._createdby_value ?? "",
    createdByJobTitle:           user?.jobtitle ?? "",
    enmax_acdndrawingcount:      r.enmax_acdndrawingcount ?? 0,
    enmax_acdnoverride:          r.enmax_acdnoverride ?? false,
    enmax_acdnreason:            r.enmax_acdnreason ?? "",
    enmax_acdnstatus:            r.enmax_acdnstatus ?? 1,
    enmax_acdndeclinereason:     r.enmax_acdndeclinereason,
    enmax_acdnissuednumbers:     r.enmax_acdnissuednumbers,
    createdon:                   r.createdon ?? "",
    businessCode: r._enmax_acdnbusiness_value ? bizMap.get(r._enmax_acdnbusiness_value) : undefined,
    assetCode:    r._enmax_acdnasset_value    ? assetMap.get(r._enmax_acdnasset_value)  : undefined,
    unitCode:     r._enmax_acdnunit_value     ? unitMap.get(r._enmax_acdnunit_value)    : undefined,
    domainCode:   r._enmax_acdndomain_value   ? domainMap.get(r._enmax_acdndomain_value): undefined,
    systemCode:   r._enmax_acdnsystem_value   ? sysMap.get(r._enmax_acdnsystem_value)   : undefined,
    kindCode:     r._enmax_acdnkind_value     ? kindMap.get(r._enmax_acdnkind_value)    : undefined,
  }));
}

export function useMyReservations(userId: string | undefined) {
  return useQuery<PendingReservation[]>({
    queryKey:     ["my-reservations", userId],
    enabled:      !!userId,
    queryFn:      () => fetchMyReservations(userId!),
    throwOnError: false,
  });
}
