import { useQuery } from "@tanstack/react-query";
import {
  Enmax_autocadreservationsService,
  Enmax_autocadbusinessesService,
  Enmax_autocadassetsService,
  Enmax_autocadunitsService,
  Enmax_autocaddomainsService,
  Enmax_autocadsystemsService,
  Enmax_autocadkindsService,
  Enmax_autocaddrawingsService,
  SystemusersService,
} from "../../../generated";
import type { Enmax_autocadreservations } from "../../../generated/models/Enmax_autocadreservationsModel";
import { reservationTypeDisplayLabel } from "../../reserve/terminology";

type RawReservation = Enmax_autocadreservations & {
  "_createdby_value@OData.Community.Display.V1.FormattedValue"?: string;
  enmax_acdnreservationtype?: number;
  enmax_acdndocumentsubtype?: number;
  enmax_acdnsequencetype?: number;
  // Target base for Add-to-existing (append) reservations. Not in the generated model.
  _enmax_acdntargetdrawing_value?: string;
  enmax_acdnappendfirst?: number;
  enmax_acdnappendlast?: number;
};

export interface PendingReservation {
  enmax_acdnreservationid: string;
  enmax_acdnreservationnumber: string;
  _createdby_value: string;
  _createdby_value_Formatted: string;
  createdByJobTitle: string;
  _enmax_acdnapprover_value: string;
  _enmax_acdnapprover_value_Formatted: string;
  submittedById: string;
  submittedByName: string;
  approvedById: string;
  approvedByName: string;
  enmax_acdndrawingcount: number;
  enmax_acdnoverride: boolean;
  enmax_acdnreason: string;
  enmax_acdnstatus: number;
  enmax_acdndeclinereason?: string;
  enmax_acdnissuednumbers?: string;
  appendFirst?: number;
  appendLast?: number;
  createdon: string;
  businessCode?: string;
  assetCode?:    string;
  unitCode?:     string;
  domainCode?:   string;
  systemCode?:   string;
  kindCode?:     string;
  typeLabel: string;
  // Append context (Add-to-existing). Present when this reservation appends child
  // items to an existing base rather than issuing new base numbers.
  sequenceType?:        number;
  reservationType?:     number;
  targetDrawingId?:     string;
  targetDrawingNumber?: string;
  isAppend: boolean;
}

/** enmax_acdnsequencetype option value for "Existing" (append to a base). */
const SEQUENCE_TYPE_EXISTING = 2;

async function fetchReservations(status: 1 | 2 | 3): Promise<PendingReservation[]> {
  const [res, biz, asset, unit, domain, sys, kind] = await Promise.all([
    Enmax_autocadreservationsService.getAll({
      filter: `enmax_acdnstatus eq ${status}`,
      select: ['enmax_autocadreservationid', 'enmax_acdnreservationid', '_createdby_value', '_enmax_acdnapprover_value', 'enmax_acdndrawingcount', 'enmax_acdnoverride', 'enmax_acdnreason', 'enmax_acdnstatus', 'enmax_acdndeclinereason', 'enmax_acdnissuednumbers', 'createdon', '_enmax_acdnbusiness_value', '_enmax_acdnasset_value', '_enmax_acdnunit_value', '_enmax_acdndomain_value', '_enmax_acdnsystem_value', '_enmax_acdnkind_value', 'enmax_acdnreservationtype', 'enmax_acdndocumentsubtype', 'enmax_acdnsequencetype', '_enmax_acdntargetdrawing_value', 'enmax_acdnappendfirst', 'enmax_acdnappendlast'],
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

  // Resolve target base numbers for Add-to-existing (append) reservations so the
  // approval panel can show "Append N items to <base>".
  const targetIds = [...new Set(
    res.data!
      .map(r => (r as RawReservation)._enmax_acdntargetdrawing_value)
      .filter((id): id is string => !!id),
  )];
  const targetDrawingMap = new Map<string, string>();
  if (targetIds.length > 0) {
    const drawingsRes = await Enmax_autocaddrawingsService.getAll({
      select: ['enmax_autocaddrawingid', 'enmax_acdnnumber'],
      filter: targetIds.map(id => `enmax_autocaddrawingid eq ${id}`).join(' or '),
    });
    for (const d of drawingsRes.data ?? []) {
      if (d.enmax_autocaddrawingid) targetDrawingMap.set(d.enmax_autocaddrawingid, d.enmax_acdnnumber ?? '');
    }
  }

  return res.data!.map(r => {
    const raw  = r as RawReservation & {
      "_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"?: string;
    };
    const user = userMap.get(r._createdby_value ?? '');
    const submitterName =
      raw["_createdby_value@OData.Community.Display.V1.FormattedValue"] ??
      user?.fullname ??
      r._createdby_value ?? '';
    const approverName =
      raw["_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"] ?? '';
    return {
      enmax_acdnreservationid:     r.enmax_autocadreservationid,
      enmax_acdnreservationnumber: r.enmax_acdnreservationid ?? '',
      _createdby_value:            r._createdby_value ?? '',
      _createdby_value_Formatted:  submitterName,
      createdByJobTitle:           user?.jobtitle ?? '',
      _enmax_acdnapprover_value:   raw._enmax_acdnapprover_value ?? '',
      _enmax_acdnapprover_value_Formatted: approverName,
      submittedById:               r._createdby_value ?? '',
      submittedByName:             submitterName,
      approvedById:                raw._enmax_acdnapprover_value ?? '',
      approvedByName:              approverName,
      enmax_acdndrawingcount:      r.enmax_acdndrawingcount ?? 0,
      enmax_acdnoverride:          r.enmax_acdnoverride ?? false,
      enmax_acdnreason:            r.enmax_acdnreason ?? '',
      enmax_acdnstatus:            r.enmax_acdnstatus ?? status,
      enmax_acdndeclinereason:     r.enmax_acdndeclinereason,
      enmax_acdnissuednumbers:     r.enmax_acdnissuednumbers,
      appendFirst:                 raw.enmax_acdnappendfirst,
      appendLast:                  raw.enmax_acdnappendlast,
      createdon:                   r.createdon ?? '',
      businessCode: r._enmax_acdnbusiness_value ? bizMap.get(r._enmax_acdnbusiness_value) : undefined,
      assetCode:    r._enmax_acdnasset_value    ? assetMap.get(r._enmax_acdnasset_value)  : undefined,
      unitCode:     r._enmax_acdnunit_value     ? unitMap.get(r._enmax_acdnunit_value)    : undefined,
      domainCode:   r._enmax_acdndomain_value   ? domainMap.get(r._enmax_acdndomain_value): undefined,
      systemCode:   r._enmax_acdnsystem_value   ? sysMap.get(r._enmax_acdnsystem_value)   : undefined,
      kindCode:     r._enmax_acdnkind_value     ? kindMap.get(r._enmax_acdnkind_value)    : undefined,
      typeLabel:    reservationTypeDisplayLabel(raw.enmax_acdnreservationtype, raw.enmax_acdndocumentsubtype),
      sequenceType:        raw.enmax_acdnsequencetype,
      reservationType:     raw.enmax_acdnreservationtype,
      targetDrawingId:     raw._enmax_acdntargetdrawing_value,
      targetDrawingNumber: raw._enmax_acdntargetdrawing_value
        ? targetDrawingMap.get(raw._enmax_acdntargetdrawing_value)
        : undefined,
      isAppend: raw.enmax_acdnsequencetype === SEQUENCE_TYPE_EXISTING && !!raw._enmax_acdntargetdrawing_value,
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
