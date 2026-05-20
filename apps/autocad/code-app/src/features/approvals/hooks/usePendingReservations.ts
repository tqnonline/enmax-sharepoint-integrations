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
import type { Enmax_autocadreservations } from "../../../generated/models/Enmax_autocadreservationsModel";

type RawReservation = Enmax_autocadreservations & {
  "_createdby_value@OData.Community.Display.V1.FormattedValue"?: string;
};

export interface PendingReservation {
  enmax_acdnreservationid: string;
  enmax_acdnreservationnumber: string;
  _createdby_value: string;
  _createdby_value_Formatted: string;
  createdByJobTitle: string;
  enmax_acdndrawingcount: number;
  enmax_acdnoverride: boolean;
  enmax_acdnreason: string;
  enmax_acdnstatus: number;
  enmax_acdndeclinereason?: string;
  enmax_acdnissuednumbers?: string;
  createdon: string;
  businessCode?: string;
  assetCode?:    string;
  unitCode?:     string;
  domainCode?:   string;
  systemCode?:   string;
  kindCode?:     string;
}

async function fetchReservations(status: 1 | 2 | 3): Promise<PendingReservation[]> {
  const [res, biz, asset, unit, domain, sys, kind] = await Promise.all([
    Enmax_autocadreservationsService.getAll({
      filter: `enmax_acdnstatus eq ${status}`,
      select: ['enmax_autocadreservationid', 'enmax_acdnreservationid', '_createdby_value', 'enmax_acdndrawingcount', 'enmax_acdnoverride', 'enmax_acdnreason', 'enmax_acdnstatus', 'enmax_acdndeclinereason', 'enmax_acdnissuednumbers', 'createdon', '_enmax_acdnbusiness_value', '_enmax_acdnasset_value', '_enmax_acdnunit_value', '_enmax_acdndomain_value', '_enmax_acdnsystem_value', '_enmax_acdnkind_value'],
      orderBy: ['createdon desc'],
    }),
    Enmax_autocadbusinessesService.getAll({ select: ['enmax_autocadbusinessid', 'enmax_acdncode'] }),
    Enmax_autocadassetsService.getAll({ select: ['enmax_autocadassetid', 'enmax_acdncode'] }),
    Enmax_autocadunitsService.getAll({ select: ['enmax_autocadunitid', 'enmax_acdncode'] }),
    Enmax_autocaddomainsService.getAll({ select: ['enmax_autocaddomainid', 'enmax_acdncode'] }),
    Enmax_autocadsystemsService.getAll({ select: ['enmax_autocadsystemid', 'enmax_acdncode'] }),
    Enmax_autocadkindsService.getAll({ select: ['enmax_autocadkindid', 'enmax_acdncode'] }),
  ]);

  if (!res.success) throw new Error('Reservations fetch failed');

  const bizMap    = new Map(biz.data?.map(r    => [r.enmax_autocadbusinessid, r.enmax_acdncode]) ?? []);
  const assetMap  = new Map(asset.data?.map(r  => [r.enmax_autocadassetid,   r.enmax_acdncode]) ?? []);
  const unitMap   = new Map(unit.data?.map(r   => [r.enmax_autocadunitid,    r.enmax_acdncode]) ?? []);
  const domainMap = new Map(domain.data?.map(r => [r.enmax_autocaddomainid,  r.enmax_acdncode]) ?? []);
  const sysMap    = new Map(sys.data?.map(r    => [r.enmax_autocadsystemid,  r.enmax_acdncode]) ?? []);
  const kindMap   = new Map(kind.data?.map(r   => [r.enmax_autocadkindid,    r.enmax_acdncode]) ?? []);

  const userIds = [...new Set(res.data!.map(r => r._createdby_value).filter((id): id is string => !!id))];
  const userMap = new Map<string, { fullname?: string; jobtitle?: string }>();
  if (userIds.length > 0) {
    const usersRes = await SystemusersService.getAll({
      select: ['systemuserid', 'fullname', 'jobtitle'],
      filter: userIds.map(id => `systemuserid eq '${id}'`).join(' or '),
    });
    for (const u of usersRes.data ?? []) {
      if (u.systemuserid) userMap.set(u.systemuserid, { fullname: u.fullname, jobtitle: u.jobtitle });
    }
  }

  return res.data!.map(r => {
    const raw  = r as RawReservation;
    const user = userMap.get(r._createdby_value ?? '');
    return {
      enmax_acdnreservationid:     r.enmax_autocadreservationid,
      enmax_acdnreservationnumber: r.enmax_acdnreservationid ?? '',
      _createdby_value:            r._createdby_value ?? '',
      _createdby_value_Formatted:
        raw["_createdby_value@OData.Community.Display.V1.FormattedValue"] ??
        user?.fullname ??
        r._createdby_value ?? '',
      createdByJobTitle:           user?.jobtitle ?? '',
      enmax_acdndrawingcount:      r.enmax_acdndrawingcount ?? 0,
      enmax_acdnoverride:          r.enmax_acdnoverride ?? false,
      enmax_acdnreason:            r.enmax_acdnreason ?? '',
      enmax_acdnstatus:            r.enmax_acdnstatus ?? status,
      enmax_acdndeclinereason:     r.enmax_acdndeclinereason,
      enmax_acdnissuednumbers:     r.enmax_acdnissuednumbers,
      createdon:                   r.createdon ?? '',
      businessCode: r._enmax_acdnbusiness_value ? bizMap.get(r._enmax_acdnbusiness_value) : undefined,
      assetCode:    r._enmax_acdnasset_value    ? assetMap.get(r._enmax_acdnasset_value)  : undefined,
      unitCode:     r._enmax_acdnunit_value     ? unitMap.get(r._enmax_acdnunit_value)    : undefined,
      domainCode:   r._enmax_acdndomain_value   ? domainMap.get(r._enmax_acdndomain_value): undefined,
      systemCode:   r._enmax_acdnsystem_value   ? sysMap.get(r._enmax_acdnsystem_value)   : undefined,
      kindCode:     r._enmax_acdnkind_value     ? kindMap.get(r._enmax_acdnkind_value)    : undefined,
    };
  });
}

export function usePendingReservations(status: 1 | 2 | 3 = 1) {
  return useQuery<PendingReservation[]>({
    queryKey:        ["reservations", status],
    queryFn:         () => fetchReservations(status),
    refetchInterval: status === 1 ? 30_000 : false,
    throwOnError:    false,
  });
}
