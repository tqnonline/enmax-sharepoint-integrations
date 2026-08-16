import type { IGetAllOptions } from "../../generated/models/CommonModels";
import type { GridFetchParams } from "./types";

/**
 * Generated IGetAllOptions omits the paging fields the runtime actually forwards
 * to retrieveMultipleRecordsAsync. Dataverse rejects $skip ("Skip Clause is not
 * supported in CRM", 0x80060888), so server paging uses maxPageSize + a skipToken
 * paging cookie, with count for the total.
 */
export type PagedGetAllOptions = IGetAllOptions & {
  count?: boolean;
  skipToken?: string;
  maxPageSize?: number;
};

/** Build getAll options for one server-paged page (no $skip). */
export function pagedGetAllOptions(
  params: GridFetchParams,
  query: { filter?: string; select: string[]; orderBy: string[] },
): PagedGetAllOptions {
  return {
    filter:      query.filter || undefined,
    select:      query.select,
    orderBy:     query.orderBy,
    maxPageSize: params.pageSize,
    skipToken:   params.skipToken,
    count:       true,
  };
}

/** Shape the getAll result into the grid's fetcher return contract. */
export function pagedResult<T>(
  result: { count?: number; skipToken?: string },
  rows: T[],
): { rows: T[]; totalCount: number; skipToken?: string } {
  if (result.count === undefined) {
    // count:true was requested; a missing total silently collapses pagination to
    // one page. Surface it (fail-loud) instead of pretending rows.length is the total.
    console.warn("[paging] server returned no @odata.count; totalCount falls back to page length and pagination may truncate.");
  }
  return { rows, totalCount: result.count ?? rows.length, skipToken: result.skipToken };
}
