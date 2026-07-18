import { Enmax_autocadreservationsService } from "../../generated/services/Enmax_autocadreservationsService";
import {
  Enmax_autocadbusinessesService,
  Enmax_autocadassetsService,
  Enmax_autocadunitsService,
  Enmax_autocaddomainsService,
  Enmax_autocadsystemsService,
  Enmax_autocadkindsService,
  Enmax_autocaddrawingsService,
} from "../../generated";
import type { GridFetchParams } from "../../components/DataGrid";
import { pagedGetAllOptions, pagedResult } from "../../components/DataGrid/serverPaging";
import { logDataverseError } from "../../components/DataGrid/dataverseError";
import { formatReservationDisplay } from "../approvals/compositionUtils";
import { reservationTypeDisplayLabel } from "../reserve/terminology";

export interface ReservationRow {
  id: string;
  /** Autonumber (RES-####) — keep for search/filter only; never show as primary UI label. */
  number: string;
  /** Coding sequence / issued range — primary user-facing label. */
  displayNumber: string;
  status: number;
  reason: string;
  typeLabel: string;
  submittedById: string;
  submittedByName: string;
  approvedById: string;
  approvedByName: string;
  createdon: string;
}

type ReservationRaw = {
  enmax_autocadreservationid: string;
  enmax_acdnreservationid?: string;
  enmax_acdnstatus?: number;
  enmax_acdnreason?: string;
  createdon?: string;
  enmax_acdnissuednumbers?: string;
  enmax_acdnreservationtype?: number;
  enmax_acdndocumentsubtype?: number;
  enmax_acdnsequencetype?: number;
  enmax_acdnappendfirst?: number;
  enmax_acdnappendlast?: number;
  _createdby_value?: string;
  "_createdby_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnapprover_value?: string;
  "_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnbusiness_value?: string;
  _enmax_acdnasset_value?: string;
  _enmax_acdnunit_value?: string;
  _enmax_acdndomain_value?: string;
  _enmax_acdnsystem_value?: string;
  _enmax_acdnkind_value?: string;
  _enmax_acdntargetdrawing_value?: string;
};

/** Maps grid column id → OData field name for server-side sort. */
const ALLOWED_SORT_COLS: Record<string, string> = {
  number:    "enmax_acdnreservationid",
  status:    "enmax_acdnstatus",
  createdon: "createdon",
};

function lookupFilter(params: GridFetchParams, col: string, field: string): string | null {
  const val = params.filters[col];
  if (!val || val === "") return null;
  const ids = Array.isArray(val) ? val : [val];
  const sub = ids.map(id => `${field} eq '${id}'`).join(" or ");
  return `(${sub})`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve reservation GUIDs whose issued drawing/document numbers contain `q`. */
async function reservationIdsForNumberNeedle(q: string): Promise<string[]> {
  const escaped = q.replace(/'/g, "''");
  const drawings = await Enmax_autocaddrawingsService.getAll({
    filter: `contains(enmax_acdnnumber,'${escaped}')`,
    select: ["_enmax_acdnreservation_value"],
    top: 200,
  });
  if (!drawings.success) {
    logDataverseError("Search/ReservationsByNumber", drawings.error);
    return [];
  }
  return [...new Set(
    (drawings.data ?? [])
      .map((d) => (d as { _enmax_acdnreservation_value?: string })._enmax_acdnreservation_value)
      .filter((id): id is string => !!id),
  )];
}

function buildReservationFilter(
  params: GridFetchParams,
  matchingReservationIds: string[] | null,
): string {
  const clauses: string[] = [];

  // Number search matches issued drawing/document numbers (via matchingReservationIds)
  // and/or reason text — never RES-#### autonumbers.
  if (params.search) {
    const q = params.search.replace(/'/g, "''");
    const parts: string[] = [`contains(enmax_acdnreason,'${q}')`];
    if (matchingReservationIds && matchingReservationIds.length > 0) {
      parts.push(
        matchingReservationIds
          .map((id) => `enmax_autocadreservationid eq ${id}`)
          .join(" or "),
      );
    }
    clauses.push(`(${parts.join(" or ")})`);
  }

  const dateFrom = params.filters.dateFrom;
  const dateTo = params.filters.dateTo;
  if (typeof dateFrom === "string" && ISO_DATE.test(dateFrom)) {
    clauses.push(`createdon ge ${dateFrom}T00:00:00Z`);
  }
  if (typeof dateTo === "string" && ISO_DATE.test(dateTo)) {
    clauses.push(`createdon le ${dateTo}T23:59:59Z`);
  }

  const peopleVal = params.filters.peopleIds;
  if (peopleVal) {
    const ids = Array.isArray(peopleVal) ? peopleVal : [peopleVal];
    const parts = ids.flatMap((id) => [
      `_createdby_value eq '${id.replace(/'/g, "''")}'`,
      `_enmax_acdnapprover_value eq '${id.replace(/'/g, "''")}'`,
    ]);
    if (parts.length) clauses.push(`(${parts.join(" or ")})`);
  }

  const submitted = lookupFilter(params, "submittedBy", "_createdby_value");
  if (submitted) clauses.push(submitted);

  const approved = lookupFilter(params, "approvedBy", "_enmax_acdnapprover_value");
  if (approved) clauses.push(approved);

  return clauses.join(" and ");
}

export async function fetchSearchReservations(
  params: GridFetchParams,
): Promise<{ rows: ReservationRow[]; totalCount: number }> {
  const needle = params.search?.trim() ?? "";
  const matchingReservationIds = needle
    ? await reservationIdsForNumberNeedle(needle)
    : null;

  // Number needle that matches neither a drawing number nor (later) reason → empty.
  // We still apply the reason OR so reason-only hits work when IDs are empty.
  const filter = buildReservationFilter(params, matchingReservationIds);

  const mappedField = params.sort ? ALLOWED_SORT_COLS[params.sort.column] : undefined;
  const safeSortDir = params.sort?.direction === "desc" ? "desc" : "asc";
  const orderBy = mappedField ? [`${mappedField} ${safeSortDir}`] : ["createdon desc"];

  const [options, biz, asset, unit, domain, sys, kind] = await Promise.all([
    Promise.resolve(pagedGetAllOptions(params, {
      filter,
      select: [
        "enmax_autocadreservationid",
        "enmax_acdnreservationid",
        "enmax_acdnstatus",
        "enmax_acdnreason",
        "createdon",
        "enmax_acdnissuednumbers",
        "enmax_acdnreservationtype",
        "enmax_acdndocumentsubtype",
        "enmax_acdnsequencetype",
        "enmax_acdnappendfirst",
        "enmax_acdnappendlast",
        "_createdby_value",
        "_enmax_acdnapprover_value",
        "_enmax_acdnbusiness_value",
        "_enmax_acdnasset_value",
        "_enmax_acdnunit_value",
        "_enmax_acdndomain_value",
        "_enmax_acdnsystem_value",
        "_enmax_acdnkind_value",
        "_enmax_acdntargetdrawing_value",
      ],
      orderBy,
    })),
    Enmax_autocadbusinessesService.getAll({ select: ["enmax_autocadbusinessid", "enmax_acdncode"] }),
    Enmax_autocadassetsService.getAll({ select: ["enmax_autocadassetid", "enmax_acdncode"] }),
    Enmax_autocadunitsService.getAll({ select: ["enmax_autocadunitid", "enmax_acdncode"] }),
    Enmax_autocaddomainsService.getAll({ select: ["enmax_autocaddomainid", "enmax_acdncode"] }),
    Enmax_autocadsystemsService.getAll({ select: ["enmax_autocadsystemid", "enmax_acdncode"] }),
    Enmax_autocadkindsService.getAll({ select: ["enmax_autocadkindid", "enmax_acdncode"] }),
  ]);

  const result = await Enmax_autocadreservationsService.getAll(options);

  if (!result.success) {
    logDataverseError("Search/Reservations", result.error);
    throw new Error("Reservations fetch failed");
  }

  const bizMap    = new Map(biz.data?.map(r => [r.enmax_autocadbusinessid, r.enmax_acdncode ?? ""]) ?? []);
  const assetMap  = new Map(asset.data?.map(r => [r.enmax_autocadassetid, r.enmax_acdncode ?? ""]) ?? []);
  const unitMap   = new Map(unit.data?.map(r => [r.enmax_autocadunitid, r.enmax_acdncode ?? ""]) ?? []);
  const domainMap = new Map(domain.data?.map(r => [r.enmax_autocaddomainid, r.enmax_acdncode ?? ""]) ?? []);
  const sysMap    = new Map(sys.data?.map(r => [r.enmax_autocadsystemid, r.enmax_acdncode ?? ""]) ?? []);
  const kindMap   = new Map(kind.data?.map(r => [r.enmax_autocadkindid, r.enmax_acdncode ?? ""]) ?? []);

  const raw = (result.data ?? []) as ReservationRaw[];
  const targetIds = [...new Set(raw.map(r => r._enmax_acdntargetdrawing_value).filter((id): id is string => !!id))];
  const targetMap = new Map<string, string>();
  if (targetIds.length > 0) {
    const drawingsRes = await Enmax_autocaddrawingsService.getAll({
      select: ["enmax_autocaddrawingid", "enmax_acdnnumber"],
      filter: targetIds.map(id => `enmax_autocaddrawingid eq ${id}`).join(" or "),
    });
    for (const d of drawingsRes.data ?? []) {
      if (d.enmax_autocaddrawingid) targetMap.set(d.enmax_autocaddrawingid, d.enmax_acdnnumber ?? "");
    }
  }

  const rows: ReservationRow[] = raw.map(r => {
    const submittedById = r._createdby_value ?? "";
    const approvedById = r._enmax_acdnapprover_value ?? "";
    const displayNumber = formatReservationDisplay({
      businessCode: r._enmax_acdnbusiness_value ? bizMap.get(r._enmax_acdnbusiness_value) : undefined,
      assetCode:    r._enmax_acdnasset_value ? assetMap.get(r._enmax_acdnasset_value) : undefined,
      unitCode:     r._enmax_acdnunit_value ? unitMap.get(r._enmax_acdnunit_value) : undefined,
      domainCode:   r._enmax_acdndomain_value ? domainMap.get(r._enmax_acdndomain_value) : undefined,
      systemCode:   r._enmax_acdnsystem_value ? sysMap.get(r._enmax_acdnsystem_value) : undefined,
      kindCode:     r._enmax_acdnkind_value ? kindMap.get(r._enmax_acdnkind_value) : undefined,
      enmax_acdnissuednumbers: r.enmax_acdnissuednumbers,
      sequenceType: r.enmax_acdnsequencetype,
      targetDrawingId: r._enmax_acdntargetdrawing_value,
      targetDrawingNumber: r._enmax_acdntargetdrawing_value
        ? targetMap.get(r._enmax_acdntargetdrawing_value)
        : undefined,
      appendFirst: r.enmax_acdnappendfirst,
      appendLast: r.enmax_acdnappendlast,
    });
    return {
      id:              r.enmax_autocadreservationid,
      number:          r.enmax_acdnreservationid ?? r.enmax_autocadreservationid,
      // Never surface RES-#### as the primary label — coding sequence / issued range only.
      displayNumber:   displayNumber || "—",
      status:          r.enmax_acdnstatus ?? 1,
      reason:          r.enmax_acdnreason ?? "",
      typeLabel:       reservationTypeDisplayLabel(r.enmax_acdnreservationtype, r.enmax_acdndocumentsubtype),
      submittedById,
      submittedByName: r["_createdby_value@OData.Community.Display.V1.FormattedValue"] ?? "",
      approvedById,
      approvedByName:  r["_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"] ?? "",
      createdon:       r.createdon ?? "",
    };
  });

  return pagedResult(result, rows);
}
