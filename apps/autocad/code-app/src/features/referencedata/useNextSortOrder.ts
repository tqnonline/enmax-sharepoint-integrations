import { useQuery } from "@tanstack/react-query";
import type { RefTableConfig } from "./tableConfig";
import { fetchRefTableSummary, fetchMaxSortOrder } from "./useRefTableData";

export function useRefTableSummary(config: RefTableConfig) {
  return useQuery({
    queryKey:     ["ref-summary", config.entityName],
    queryFn:      () => fetchRefTableSummary(config),
    staleTime:    30_000,
    throwOnError: false,
  });
}

export function useNextSortOrder(config: RefTableConfig) {
  return useQuery({
    queryKey:     ["ref-next-sort", config.entityName],
    queryFn:      async () => (await fetchMaxSortOrder(config)) + 10,
    throwOnError: false,
  });
}
