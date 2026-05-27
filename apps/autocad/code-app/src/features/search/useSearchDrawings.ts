import { Enmax_autocaddrawingsService } from "../../generated";
import type { GridFetchParams } from "../../components/DataGrid";
import { pagedGetAllOptions, pagedResult } from "../../components/DataGrid/serverPaging";
import { logDataverseError } from "../../components/DataGrid/dataverseError";

export interface DrawingRow {
  id: string;
  enmax_acdnnumber: string;
  enmax_acdntitle: string;
  enmax_acdncurrentrevision: string;
  enmax_acdnrevisiondate: string;
  enmax_acdnstate: number;
  enmax_acdnsheetcount: number;
  enmax_acdnsplibraryurl: string;
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
  businessDisplay: string;
  assetDisplay: string;
  unitDisplay: string;
  domainDisplay: string;
  systemDisplay: string;
  kindDisplay: string;
  recordTypeDisplay: string;
  recordPhaseDisplay: string;
  vendorDisplay: string;
  requesterDisplay: string;
}

type DrawingRaw = {
  enmax_autocaddrawingid: string;
  enmax_acdnnumber?: string;
  enmax_acdntitle?: string;
  enmax_acdncurrentrevision?: string;
  enmax_acdnrevisiondate?: string;
  enmax_acdnstate?: number;
  enmax_acdnsheetcount?: number;
  enmax_acdnsplibraryurl?: string;
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
};

const ALLOWED_SORT_COLS = new Set([
  "enmax_acdnnumber", "enmax_acdntitle", "enmax_acdncurrentrevision",
  "enmax_acdnrevisiondate", "enmax_acdnstate", "enmax_acdnsheetcount",
]);

function buildFilter(params: GridFetchParams): string {
  const clauses: string[] = [];

  if (params.search) {
    const q = params.search.replace(/'/g, "''");
    clauses.push(
      `(contains(enmax_acdnnumber,'${q}') or contains(enmax_acdntitle,'${q}'))`,
    );
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

  const stateVal = params.filters["enmax_acdnstate"];
  if (stateVal && stateVal !== "") {
    const states = Array.isArray(stateVal) ? stateVal : [stateVal];
    const sub = states.map(s => `enmax_acdnstate eq ${Number(s)}`).join(" or ");
    clauses.push(`(${sub})`);
  }

  return clauses.join(" and ");
}

export async function fetchSearchDrawings(
  params: GridFetchParams,
): Promise<{ rows: DrawingRow[]; totalCount: number }> {
  const filter = buildFilter(params);
  const safeSortCol = params.sort && ALLOWED_SORT_COLS.has(params.sort.column) ? params.sort.column : null;
  const safeSortDir = params.sort?.direction === "desc" ? "desc" : "asc";
  const orderBy = safeSortCol ? [`${safeSortCol} ${safeSortDir}`] : ["enmax_acdnnumber asc"];

  const options = pagedGetAllOptions(params, {
    filter,
    select: [
      "enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdntitle",
      "enmax_acdncurrentrevision", "enmax_acdnrevisiondate", "enmax_acdnstate",
      "enmax_acdnsheetcount", "enmax_acdnsplibraryurl",
      "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
      "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
      "_enmax_acdnrecordtype_value", "_enmax_acdnrecordphase_value",
      "_enmax_acdnvendor_value", "_createdby_value",
    ],
    orderBy,
  });
  const result = await Enmax_autocaddrawingsService.getAll(options);

  if (!result.success) {
    logDataverseError("Search/Drawings", result.error);
    throw new Error("Drawings fetch failed");
  }

  const raw = (result.data ?? []) as DrawingRaw[];
  const rows: DrawingRow[] = raw.map(r => ({
    id:                     r.enmax_autocaddrawingid,
    enmax_acdnnumber:       r.enmax_acdnnumber ?? "",
    enmax_acdntitle:        r.enmax_acdntitle ?? "",
    enmax_acdncurrentrevision: r.enmax_acdncurrentrevision ?? "",
    enmax_acdnrevisiondate: r.enmax_acdnrevisiondate ?? "",
    enmax_acdnstate:        r.enmax_acdnstate ?? 1,
    enmax_acdnsheetcount:   r.enmax_acdnsheetcount ?? 0,
    enmax_acdnsplibraryurl: r.enmax_acdnsplibraryurl ?? "",
    _enmax_acdnbusiness_value:   r._enmax_acdnbusiness_value ?? "",
    _enmax_acdnasset_value:      r._enmax_acdnasset_value ?? "",
    _enmax_acdnunit_value:       r._enmax_acdnunit_value ?? "",
    _enmax_acdndomain_value:     r._enmax_acdndomain_value ?? "",
    _enmax_acdnsystem_value:     r._enmax_acdnsystem_value ?? "",
    _enmax_acdnkind_value:       r._enmax_acdnkind_value ?? "",
    _enmax_acdnrecordtype_value: r._enmax_acdnrecordtype_value ?? "",
    _enmax_acdnrecordphase_value:r._enmax_acdnrecordphase_value ?? "",
    _enmax_acdnvendor_value:     r._enmax_acdnvendor_value ?? "",
    _createdby_value:            r._createdby_value ?? "",
    businessDisplay:    r["_enmax_acdnbusiness_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    assetDisplay:       r["_enmax_acdnasset_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    unitDisplay:        r["_enmax_acdnunit_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    domainDisplay:      r["_enmax_acdndomain_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    systemDisplay:      r["_enmax_acdnsystem_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    kindDisplay:        r["_enmax_acdnkind_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    recordTypeDisplay:  r["_enmax_acdnrecordtype_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    recordPhaseDisplay: r["_enmax_acdnrecordphase_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    vendorDisplay:      r["_enmax_acdnvendor_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    requesterDisplay:   r["_createdby_value@OData.Community.Display.V1.FormattedValue"] ?? "",
  }));

  return pagedResult(result, rows);
}
