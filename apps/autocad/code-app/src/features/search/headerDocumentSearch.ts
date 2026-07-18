import { fetchSearchDocuments, type SearchDocumentRow } from "./useSearchDocuments";
import type { SearchListFilters, SearchTab } from "./searchListFilters";
import { emptyComposition } from "./searchListFilters";
import type { MatchingGuids } from "./compositionQuery";
import { guidsToCompositionFilter } from "./compositionQuery";
import type { HeaderSearchTab } from "./searchUrlState";

const HEADER_LIMIT = 8;

export interface HeaderDocumentResult {
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

function toHeaderRow(row: SearchDocumentRow, tab: SearchTab): HeaderDocumentResult {
  return {
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

async function fetchTab(
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
  return result.rows.map((r) => toHeaderRow(r, tab));
}

export async function fetchHeaderDocuments(
  q: string,
  tab: HeaderSearchTab,
  guids?: MatchingGuids,
): Promise<HeaderDocumentResult[]> {
  const filters = buildFilters(q, guids);

  if (tab === "drawings") return fetchTab("drawings", filters);
  if (tab === "documents") return fetchTab("documents", filters);

  const [drawings, documents] = await Promise.all([
    fetchTab("drawings", filters),
    fetchTab("documents", filters),
  ]);
  const merged = [...drawings, ...documents];
  merged.sort((a, b) => a.documentNumber.localeCompare(b.documentNumber));
  return merged.slice(0, HEADER_LIMIT);
}
