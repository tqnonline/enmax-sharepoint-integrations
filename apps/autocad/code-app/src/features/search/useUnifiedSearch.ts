import { Enmax_autocadreservationsService } from "../../generated/services/Enmax_autocadreservationsService";
import type { GridFetchParams } from "../../components/DataGrid";
import { pagedGetAllOptions, pagedResult } from "../../components/DataGrid/serverPaging";

export interface ReservationRow {
  id: string;
  number: string;
  status: number;
  reason: string;
  requesterName: string;
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
};

/** Maps grid column id → OData field name for server-side sort. */
const ALLOWED_SORT_COLS: Record<string, string> = {
  number:    "enmax_acdnreservationid",
  status:    "enmax_acdnstatus",
  createdon: "createdon",
};

function buildReservationFilter(params: GridFetchParams): string {
  if (!params.search) return "";
  const q = params.search.replace(/'/g, "''");
  return `contains(enmax_acdnreservationid,'${q}') or contains(enmax_acdnreason,'${q}')`;
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
    ],
    orderBy,
  });
  const result = await Enmax_autocadreservationsService.getAll(options);

  if (!result.success) throw new Error("Reservations fetch failed");

  const raw = (result.data ?? []) as ReservationRaw[];
  const rows: ReservationRow[] = raw.map(r => {
    const requesterName =
      r["_createdby_value@OData.Community.Display.V1.FormattedValue"] ?? "";
    return {
      id:           r.enmax_autocadreservationid,
      number:       r.enmax_acdnreservationid ?? r.enmax_autocadreservationid,
      status:       r.enmax_acdnstatus ?? 1,
      reason:       r.enmax_acdnreason ?? "",
      requesterName,
      createdon:    r.createdon ?? "",
    };
  });

  return pagedResult(result, rows);
}
