import { Enmax_autocaddrawingsService, Enmax_autocadreservationsService } from "../../generated";
import type { GridFetchParams } from "../../components/DataGrid";
import { pagedGetAllOptions, pagedResult } from "../../components/DataGrid/serverPaging";
import { logDataverseError } from "../../components/DataGrid/dataverseError";
import { reservationTypeDisplayLabel } from "../reserve/terminology";
import { drawingSubtypeClause, documentsTabClause } from "./searchListFilters";

export interface DrawingRow {
  id: string;
  enmax_acdnnumber: string;
  enmax_acdntitle: string;
  enmax_acdncurrentrevision: string;
  enmax_acdnrevisiondate: string;
  enmax_acdnstate: number;
  enmax_acdnsheetcount: number;
  /** WS6 taxonomy denormalized onto the record (ADR 0001). */
  enmax_acdnreservationtype?: number;
  enmax_acdndocumentsubtype?: number;
  /** Derived label: "Drawing" | "Standard Document" | "Procedure Form". */
  typeLabel: string;
  enmax_acdnsplibraryurl: string;
  enmax_acdnspdestinationurl: string;
  enmax_acdnpresentindropoff?: boolean;
  enmax_acdnpresentindestination?: boolean;
  _enmax_acdnbusiness_value: string;
  _enmax_acdnasset_value: string;
  _enmax_acdnunit_value: string;
  _enmax_acdndomain_value: string;
  _enmax_acdnsystem_value: string;
  _enmax_acdnkind_value: string;
  _enmax_acdnrecordtype_value: string;
  _enmax_acdnrecordphase_value: string;
  _enmax_acdnvendor_value: string;
  _createdby_value: string;
  submittedById: string;
  submittedByName: string;
  approvedById: string;
  approvedByName: string;
  businessDisplay: string;
  assetDisplay: string;
  unitDisplay: string;
  domainDisplay: string;
  systemDisplay: string;
  kindDisplay: string;
  recordTypeDisplay: string;
  recordPhaseDisplay: string;
  vendorDisplay: string;
  /** @deprecated use submittedByName */
  requesterDisplay: string;
  /** Parent reservation GUID when linked (for document activity trail). */
  reservationId?: string;
  /** Record createdon — issuance fallback for Activity when Allocated audit is absent. */
  createdOn?: string;
}

type DrawingRaw = {
  enmax_autocaddrawingid: string;
  enmax_acdnnumber?: string;
  enmax_acdntitle?: string;
  enmax_acdncurrentrevision?: string;
  enmax_acdnrevisiondate?: string;
  enmax_acdnstate?: number;
  enmax_acdnsheetcount?: number;
  enmax_acdnreservationtype?: number;
  enmax_acdndocumentsubtype?: number;
  enmax_acdnsplibraryurl?: string;
  enmax_acdnspdestinationurl?: string;
  enmax_acdnpresentindropoff?: boolean;
  enmax_acdnpresentindestination?: boolean;
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
  _enmax_acdnrecordtype_value?: string;
  "_enmax_acdnrecordtype_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnrecordphase_value?: string;
  "_enmax_acdnrecordphase_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnvendor_value?: string;
  "_enmax_acdnvendor_value@OData.Community.Display.V1.FormattedValue"?: string;
  _createdby_value?: string;
  "_createdby_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnreservation_value?: string;
};

export const DRAWING_STATE_LABELS: Record<number, string> = {
  0: "None",
  1: "Available",
  2: "Checked Out",
  3: "Awaiting Validation",
  4: "Checked In",
  5: "Obsolete",
  6: "Void",
  7: "Finalized",
  8: "Pending SharePoint Import",
};

const ALLOWED_SORT_COLS = new Set([
  "enmax_acdnnumber", "enmax_acdntitle", "enmax_acdncurrentrevision",
  "enmax_acdnrevisiondate", "enmax_acdnstate", "enmax_acdnsheetcount",
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function buildPeopleClause(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const submitParts = ids.map((id) => `_createdby_value eq '${id.replace(/'/g, "''")}'`);
  const approverFilter = ids.map((id) => `_enmax_acdnapprover_value eq '${id.replace(/'/g, "''")}'`).join(" or ");
  const resResult = await Enmax_autocadreservationsService.getAll({
    filter: `(${approverFilter})`,
    select: ["enmax_autocadreservationid"],
    top: 500,
  });
  const resIds = (resResult.data ?? [])
    .map((r) => r.enmax_autocadreservationid)
    .filter((id): id is string => !!id);
  const reservationParts = resIds.map((id) => `_enmax_acdnreservation_value eq '${id}'`);
  const all = [...submitParts, ...reservationParts];
  return all.length ? `(${all.join(" or ")})` : null;
}

async function buildFilter(params: GridFetchParams): Promise<string> {
  const clauses: string[] = [];

  if (params.search) {
    const q = params.search.replace(/'/g, "''");
    clauses.push(
      `(contains(enmax_acdnnumber,'${q}') or contains(enmax_acdntitle,'${q}'))`,
    );
  }

  const dateFrom = params.filters.dateFrom;
  const dateTo = params.filters.dateTo;
  // Issued-date window: use createdon (always set on issue). Revision date is only
  // populated after check-in, so filtering on it alone hides new drawings/documents.
  if (typeof dateFrom === "string" && ISO_DATE.test(dateFrom)) {
    clauses.push(`createdon ge ${dateFrom}T00:00:00Z`);
  }
  if (typeof dateTo === "string" && ISO_DATE.test(dateTo)) {
    clauses.push(`createdon le ${dateTo}T23:59:59Z`);
  }

  const subtypeVal = params.filters.documentSubtype;
  if (typeof subtypeVal === "string" && subtypeVal !== "") {
    const subtypeClause = drawingSubtypeClause(subtypeVal as "drawing" | "standard" | "procedure");
    if (subtypeClause) clauses.push(subtypeClause);
  }

  if (params.filters.taxonomyScope === "documents") {
    clauses.push(documentsTabClause());
  }

  const peopleVal = params.filters.peopleIds;
  if (peopleVal) {
    const ids = Array.isArray(peopleVal) ? peopleVal : [peopleVal];
    const peopleClause = await buildPeopleClause(ids.filter(Boolean));
    if (peopleClause) clauses.push(peopleClause);
  }

  const lookup = (col: string, field: string) => {
    const val = params.filters[col];
    if (!val || val === "") return;
    const ids = Array.isArray(val) ? val : [val];
    const sub = ids.map(id => `${field} eq '${id}'`).join(" or ");
    clauses.push(`(${sub})`);
  };

  lookup("business",    "_enmax_acdnbusiness_value");
  lookup("asset",       "_enmax_acdnasset_value");
  lookup("unit",        "_enmax_acdnunit_value");
  lookup("domain",      "_enmax_acdndomain_value");
  lookup("system",      "_enmax_acdnsystem_value");
  lookup("kind",        "_enmax_acdnkind_value");
  lookup("recordType",  "_enmax_acdnrecordtype_value");
  lookup("recordPhase", "_enmax_acdnrecordphase_value");
  lookup("vendor",      "_enmax_acdnvendor_value");
  lookup("submittedBy", "_createdby_value");

  const approvedVal = params.filters["approvedBy"];
  if (approvedVal && approvedVal !== "") {
    const approverIds = Array.isArray(approvedVal) ? approvedVal : [approvedVal];
    const approverFilter = approverIds.map(id => `_enmax_acdnapprover_value eq '${id}'`).join(" or ");
    const resResult = await Enmax_autocadreservationsService.getAll({
      filter: `(${approverFilter})`,
      select: ["enmax_autocadreservationid"],
      top: 500,
    });
    const resIds = (resResult.data ?? [])
      .map(r => r.enmax_autocadreservationid)
      .filter((id): id is string => !!id);
    if (resIds.length === 0) {
      clauses.push("enmax_autocaddrawingid eq '00000000-0000-0000-0000-000000000000'");
    } else {
      const sub = resIds.map(id => `_enmax_acdnreservation_value eq '${id}'`).join(" or ");
      clauses.push(`(${sub})`);
    }
  }

  const stateVal = params.filters["enmax_acdnstate"];
  if (stateVal && stateVal !== "") {
    const states = Array.isArray(stateVal) ? stateVal : [stateVal];
    const sub = states.map(s => `enmax_acdnstate eq ${Number(s)}`).join(" or ");
    clauses.push(`(${sub})`);
  } else {
    // Pending SharePoint Import (8) is admin-only until Save & Approve.
    clauses.push("enmax_acdnstate ne 8");
  }

  return clauses.join(" and ");
}

async function fetchReservationApprovers(
  reservationIds: string[],
): Promise<Map<string, { id: string; name: string }>> {
  const unique = [...new Set(reservationIds.filter(Boolean))];
  const map = new Map<string, { id: string; name: string }>();
  if (unique.length === 0) return map;
  const filter = unique.map(id => `enmax_autocadreservationid eq '${id}'`).join(" or ");
  const result = await Enmax_autocadreservationsService.getAll({
    filter: `(${filter})`,
    select: ["enmax_autocadreservationid", "_enmax_acdnapprover_value"],
  });
  for (const r of result.data ?? []) {
    const raw = r as {
      enmax_autocadreservationid?: string;
      _enmax_acdnapprover_value?: string;
      "_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"?: string;
    };
    if (!raw.enmax_autocadreservationid) continue;
    map.set(raw.enmax_autocadreservationid, {
      id: raw._enmax_acdnapprover_value ?? "",
      name: raw["_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    });
  }
  return map;
}

export async function fetchSearchDrawings(
  params: GridFetchParams,
): Promise<{ rows: DrawingRow[]; totalCount: number }> {
  const filter = await buildFilter(params);
  const safeSortCol = params.sort && ALLOWED_SORT_COLS.has(params.sort.column) ? params.sort.column : null;
  const safeSortDir = params.sort?.direction === "desc" ? "desc" : "asc";
  const orderBy = safeSortCol ? [`${safeSortCol} ${safeSortDir}`] : ["enmax_acdnnumber asc"];

  const options = pagedGetAllOptions(params, {
    filter,
    select: [
      "enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdntitle",
      "enmax_acdncurrentrevision", "enmax_acdnrevisiondate", "enmax_acdnstate",
      "enmax_acdnsheetcount", "enmax_acdnreservationtype", "enmax_acdndocumentsubtype",
      "enmax_acdnsplibraryurl", "enmax_acdnspdestinationurl",
      "enmax_acdnpresentindropoff", "enmax_acdnpresentindestination",
      "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
      "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
      "_enmax_acdnrecordtype_value", "_enmax_acdnrecordphase_value",
      "_enmax_acdnvendor_value", "_createdby_value", "_enmax_acdnreservation_value",
    ],
    orderBy,
  });
  const result = await Enmax_autocaddrawingsService.getAll(options);

  if (!result.success) {
    logDataverseError("Search/Drawings", result.error);
    throw new Error("Drawings fetch failed");
  }

  const raw = (result.data ?? []) as DrawingRaw[];
  const approverMap = await fetchReservationApprovers(
    raw.map(r => r._enmax_acdnreservation_value ?? ""),
  );
  const rows: DrawingRow[] = raw.map(r => {
    const submittedById = r._createdby_value ?? "";
    const submittedByName = r["_createdby_value@OData.Community.Display.V1.FormattedValue"] ?? "";
    const reservationId = r._enmax_acdnreservation_value ?? "";
    const approver = reservationId ? approverMap.get(reservationId) : undefined;
    return {
    id:                     r.enmax_autocaddrawingid,
    enmax_acdnnumber:       r.enmax_acdnnumber ?? "",
    enmax_acdntitle:        r.enmax_acdntitle ?? "",
    enmax_acdncurrentrevision: r.enmax_acdncurrentrevision ?? "",
    enmax_acdnrevisiondate: r.enmax_acdnrevisiondate ?? "",
    enmax_acdnstate:        r.enmax_acdnstate ?? 1,
    enmax_acdnsheetcount:   r.enmax_acdnsheetcount ?? 0,
    enmax_acdnreservationtype: r.enmax_acdnreservationtype,
    enmax_acdndocumentsubtype: r.enmax_acdndocumentsubtype,
    typeLabel:              reservationTypeDisplayLabel(r.enmax_acdnreservationtype, r.enmax_acdndocumentsubtype),
    enmax_acdnsplibraryurl: r.enmax_acdnsplibraryurl ?? "",
    enmax_acdnspdestinationurl: r.enmax_acdnspdestinationurl ?? "",
    enmax_acdnpresentindropoff: r.enmax_acdnpresentindropoff ?? false,
    enmax_acdnpresentindestination: r.enmax_acdnpresentindestination ?? false,
    _enmax_acdnbusiness_value:   r._enmax_acdnbusiness_value ?? "",
    _enmax_acdnasset_value:      r._enmax_acdnasset_value ?? "",
    _enmax_acdnunit_value:       r._enmax_acdnunit_value ?? "",
    _enmax_acdndomain_value:     r._enmax_acdndomain_value ?? "",
    _enmax_acdnsystem_value:     r._enmax_acdnsystem_value ?? "",
    _enmax_acdnkind_value:       r._enmax_acdnkind_value ?? "",
    _enmax_acdnrecordtype_value: r._enmax_acdnrecordtype_value ?? "",
    _enmax_acdnrecordphase_value:r._enmax_acdnrecordphase_value ?? "",
    _enmax_acdnvendor_value:     r._enmax_acdnvendor_value ?? "",
    _createdby_value:            submittedById,
    submittedById,
    submittedByName,
    approvedById:   approver?.id ?? "",
    approvedByName: approver?.name ?? "",
    businessDisplay:    r["_enmax_acdnbusiness_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    assetDisplay:       r["_enmax_acdnasset_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    unitDisplay:        r["_enmax_acdnunit_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    domainDisplay:      r["_enmax_acdndomain_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    systemDisplay:      r["_enmax_acdnsystem_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    kindDisplay:        r["_enmax_acdnkind_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    recordTypeDisplay:  r["_enmax_acdnrecordtype_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    recordPhaseDisplay: r["_enmax_acdnrecordphase_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    vendorDisplay:      r["_enmax_acdnvendor_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    requesterDisplay:   submittedByName,
  };
  });

  return pagedResult(result, rows);
}
