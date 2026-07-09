import { useQuery } from "@tanstack/react-query";
import { fetchHeaderDocuments } from "../features/search/headerDocumentSearch";
import type { MatchingGuids } from "../features/search/compositionQuery";
import type { HeaderSearchTab } from "../features/search/searchUrlState";

export type { HeaderDocumentResult as HeaderSearchResult } from "../features/search/headerDocumentSearch";
export type { MatchingGuids } from "../features/search/compositionQuery";

export function useHeaderSearch(query: string, tab: HeaderSearchTab, guids?: MatchingGuids) {
  return useQuery({
    queryKey: ["header-document-search", query, tab, guids ? JSON.stringify(guids) : null],
    queryFn: () => fetchHeaderDocuments(query, tab, guids),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
    placeholderData: [],
  });
}
