import { Enmax_autocadreservationsService } from "../../generated/services/Enmax_autocadreservationsService";
import type { GridFetchParams } from "../../components/DataGrid";
import { pagedGetAllOptions, pagedResult } from "../../components/DataGrid/serverPaging";
import { logDataverseError } from "../../components/DataGrid/dataverseError";

export interface ReservationRow {
  id: string;
  number: string;
  status: number;
  reason: string;
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
  _createdby_value?: string;
  "_createdby_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnapprover_value?: string;
  "_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"?: string;
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

function buildReservationFilter(params: GridFetchParams): string {
  const clauses: string[] = [];

  if (params.search) {
    const q = params.search.replace(/'/g, "''");
    clauses.push(`(contains(enmax_acdnreservationid,'${q}') or contains(enmax_acdnreason,'${q}'))`);
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
  const filter = buildReservationFilter(params);

  const mappedField = params.sort ? ALLOWED_SORT_COLS[params.sort.column] : undefined;
  const safeSortDir = params.sort?.direction === "desc" ? "desc" : "asc";
  const orderBy = mappedField ? [`${mappedField} ${safeSortDir}`] : ["enmax_acdnreservationid asc"];

  const options = pagedGetAllOptions(params, {
    filter,
    select: [
      "enmax_autocadreservationid",
      "enmax_acdnreservationid",
      "enmax_acdnstatus",
      "enmax_acdnreason",
      "createdon",
      "_createdby_value",
      "_enmax_acdnapprover_value",
    ],
    orderBy,
  });
  const result = await Enmax_autocadreservationsService.getAll(options);

  if (!result.success) {
    logDataverseError("Search/Reservations", result.error);
    throw new Error("Reservations fetch failed");
  }

  const raw = (result.data ?? []) as ReservationRaw[];
  const rows: ReservationRow[] = raw.map(r => {
    const submittedById = r._createdby_value ?? "";
    const approvedById = r._enmax_acdnapprover_value ?? "";
    return {
      id:              r.enmax_autocadreservationid,
      number:          r.enmax_acdnreservationid ?? r.enmax_autocadreservationid,
      status:          r.enmax_acdnstatus ?? 1,
      reason:          r.enmax_acdnreason ?? "",
      submittedById,
      submittedByName: r["_createdby_value@OData.Community.Display.V1.FormattedValue"] ?? "",
      approvedById,
      approvedByName:  r["_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"] ?? "",
      createdon:       r.createdon ?? "",
    };
  });

  return pagedResult(result, rows);
}
