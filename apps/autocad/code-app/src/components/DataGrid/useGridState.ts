import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { FilterValue, GridFetchParams } from "./types";

const PAGE_SIZE_DEFAULT = 50;

export function useGridState(
  defaultSort?: { column: string; direction: "asc" | "desc" },
  initialPageSize = PAGE_SIZE_DEFAULT,
) {
  const [params, setParams] = useSearchParams();

  const search  = params.get("q") ?? "";
  const page    = Number(params.get("page") ?? "0");
  const sortCol = params.get("sort") ?? defaultSort?.column ?? "";
  const sortDir = (params.get("dir") ?? defaultSort?.direction ?? "asc") as "asc" | "desc";

  const filters = useMemo<Record<string, FilterValue>>(() => {
    const out: Record<string, FilterValue> = {};
    params.forEach((val, key) => {
      if (key.startsWith("f.")) {
        const col = key.slice(2);
        const existing = out[col];
        if (existing === undefined) {
          out[col] = val;
        } else if (Array.isArray(existing)) {
          out[col] = [...existing, val];
        } else {
          out[col] = [existing as string, val];
        }
      }
    });
    return out;
  }, [params]);

  const fetchParams = useMemo<GridFetchParams>(() => ({
    search,
    filters,
    sort: sortCol ? { column: sortCol, direction: sortDir } : null,
    page,
    pageSize: initialPageSize,
  }), [search, filters, sortCol, sortDir, page, initialPageSize]);

  const setSearch = useCallback((q: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (q) next.set("q", q); else next.delete("q");
      next.delete("page");
      return next;
    });
  }, [setParams]);

  const setPage = useCallback((p: number) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (p > 0) next.set("page", String(p)); else next.delete("page");
      return next;
    });
  }, [setParams]);

  const setSort = useCallback((col: string, dir: "asc" | "desc") => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("sort", col);
      next.set("dir", dir);
      next.delete("page");
      return next;
    });
  }, [setParams]);

  const setFilter = useCallback((col: string, val: FilterValue) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      // Remove existing filter entries for this col
      const toDelete: string[] = [];
      next.forEach((_, key) => { if (key === `f.${col}`) toDelete.push(key); });
      toDelete.forEach(k => next.delete(k));

      if (Array.isArray(val)) {
        val.forEach(v => next.append(`f.${col}`, v));
      } else if (val) {
        next.set(`f.${col}`, val);
      }
      next.delete("page");
      return next;
    });
  }, [setParams]);

  return { fetchParams, search, page, sortCol, sortDir, filters, setSearch, setPage, setSort, setFilter };
}
