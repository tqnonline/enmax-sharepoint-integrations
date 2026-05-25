import type { GridFetchParams } from "./types";

/**
 * Shared client-side filter → search → sort → slice for grids backed by a small,
 * fully-fetched result set (reference data, app config, per-user items, junctions).
 * Large unbounded tables (Search) use server-side skipToken paging instead.
 *
 * @param rows   the full result set already mapped to display rows
 * @param params grid fetch params (search/sort/page/pageSize)
 * @param opts.filter     extra predicate applied before search (e.g. statecode)
 * @param opts.searchText fields on a row to match params.search against (case-insensitive)
 */
export function clientPage<T>(
  rows: T[],
  params: GridFetchParams,
  opts?: { filter?: (row: T) => boolean; searchText?: (row: T) => string[] },
): { rows: T[]; totalCount: number } {
  let out = opts?.filter ? rows.filter(opts.filter) : rows;

  if (params.search && opts?.searchText) {
    const q = params.search.toLowerCase();
    out = out.filter(r => opts.searchText!(r).some(f => f.toLowerCase().includes(q)));
  }

  if (params.sort) {
    const { column, direction } = params.sort;
    out = [...out].sort((a, b) => {
      const av = (a as Record<string, unknown>)[column];
      const bv = (b as Record<string, unknown>)[column];
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return direction === "asc" ? cmp : -cmp;
    });
  }

  const totalCount = out.length;
  const start = params.page * params.pageSize;
  return { rows: out.slice(start, start + params.pageSize), totalCount };
}
