import { useQuery } from "@tanstack/react-query";
import { fetchHeaderSearch } from "../features/search/headerSearch";
import type { MatchingGuids } from "../features/search/compositionQuery";
import type { HeaderSearchTab } from "../features/search/searchUrlState";

export type { HeaderSearchResult } from "../features/search/headerSearch";
export type { MatchingGuids } from "../features/search/compositionQuery";

export function useHeaderSearch(query: string, tab: HeaderSearchTab, guids?: MatchingGuids) {
  return useQuery({
    queryKey: ["header-search", query, tab, guids ? JSON.stringify(guids) : null],
    enabled: query.trim().length >= 2,
    queryFn: () => fetchHeaderSearch(query, tab, guids),
    staleTime: 30_000,
    placeholderData: [],
  });
}
