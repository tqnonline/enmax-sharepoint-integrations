import { fetchSearchDocuments, type SearchDocumentRow } from "./useSearchDocuments";
import type { SearchListFilters, SearchTab } from "./searchListFilters";
import { emptyComposition } from "./searchListFilters";
import type { MatchingGuids } from "./compositionQuery";
import { guidsToCompositionFilter } from "./compositionQuery";
import type { HeaderSearchTab } from "./searchUrlState";

const HEADER_LIMIT = 8;

export interface HeaderDocumentResult {
  kind: "document";
  id: string;
  drawingId: string;
  documentNumber: string;
  title: string;
  filename: string;
  typeLabel: string;
  stateLabel: string;
  tab: SearchTab;
  compositionSummary: string;
  revisionDate: string;
}

/** Header search returns issued document/drawing numbers only — never RES-####. */
export type HeaderSearchResult = HeaderDocumentResult;

function buildFilters(q: string, guids?: MatchingGuids): SearchListFilters {
  return {
    number: q.trim(),
    from: "",
    to: "",
    documentSubtype: "all",
    documentStatus: "all",
    peopleIds: [],
    composition: guids ? guidsToCompositionFilter(guids) : emptyComposition(),
  };
}

function toHeaderDocument(row: SearchDocumentRow, tab: SearchTab): HeaderDocumentResult {
  return {
    kind: "document",
    id: row.id,
    drawingId: row.drawingId,
    documentNumber: row.documentNumber,
    title: row.title,
    filename: row.filename,
    typeLabel: row.typeLabel,
    stateLabel: row.stateLabel,
    tab,
    compositionSummary: row.compositionSummary,
    revisionDate: row.revisionDate,
  };
}

async function fetchDocuments(
  tab: SearchTab,
  filters: SearchListFilters,
): Promise<HeaderDocumentResult[]> {
  const result = await fetchSearchDocuments(tab, filters, {
    search: "",
    filters: {},
    sort: { column: "documentNumber", direction: "asc" },
    page: 0,
    pageSize: HEADER_LIMIT,
  });
  return result.rows.map((r) => toHeaderDocument(r, tab));
}

export async function fetchHeaderSearch(
  q: string,
  tab: HeaderSearchTab,
  guids?: MatchingGuids,
): Promise<HeaderSearchResult[]> {
  const filters = buildFilters(q, guids);

  if (tab === "drawings") return fetchDocuments("drawings", filters);
  if (tab === "documents") return fetchDocuments("documents", filters);

  const [drawings, documents] = await Promise.all([
    fetchDocuments("drawings", filters),
    fetchDocuments("documents", filters),
  ]);
  const merged = [...drawings, ...documents];
  merged.sort((a, b) => a.documentNumber.localeCompare(b.documentNumber));
  return merged.slice(0, HEADER_LIMIT);
}

/** @deprecated Use fetchHeaderSearch */
export const fetchHeaderDocuments = fetchHeaderSearch;
export type { HeaderDocumentResult as LegacyHeaderDocumentResult };
