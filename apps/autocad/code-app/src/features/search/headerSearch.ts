import { fetchSearchDocuments, type SearchDocumentRow } from "./useSearchDocuments";
import { fetchSearchReservations, type ReservationRow } from "./useUnifiedSearch";
import type { SearchListFilters, SearchTab } from "./searchListFilters";
import { emptyComposition } from "./searchListFilters";
import type { MatchingGuids } from "./compositionQuery";
import { guidsToCompositionFilter } from "./compositionQuery";
import type { HeaderSearchTab } from "./searchUrlState";
import { RESERVATION_STATUS } from "../myitems/useMyReservations";

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
  tab: Exclude<SearchTab, "reservations">;
  compositionSummary: string;
  revisionDate: string;
}

export interface HeaderReservationResult {
  kind: "reservation";
  id: string;
  reservationNumber: string;
  statusLabel: string;
  reason: string;
  submittedByName: string;
  createdon: string;
}

export type HeaderSearchResult = HeaderDocumentResult | HeaderReservationResult;

function buildFilters(q: string, guids?: MatchingGuids): SearchListFilters {
  return {
    number: q.trim(),
    from: "",
    to: "",
    documentSubtype: "all",
    peopleIds: [],
    composition: guids ? guidsToCompositionFilter(guids) : emptyComposition(),
  };
}

function toHeaderDocument(row: SearchDocumentRow, tab: Exclude<SearchTab, "reservations">): HeaderDocumentResult {
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

function toHeaderReservation(row: ReservationRow): HeaderReservationResult {
  return {
    kind: "reservation",
    id: row.id,
    reservationNumber: row.number,
    statusLabel: RESERVATION_STATUS[row.status] ?? String(row.status),
    reason: row.reason,
    submittedByName: row.submittedByName,
    createdon: row.createdon,
  };
}

async function fetchDocuments(
  tab: Exclude<SearchTab, "reservations">,
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

async function fetchReservations(q: string): Promise<HeaderReservationResult[]> {
  const result = await fetchSearchReservations({
    search: q.trim(),
    filters: {},
    sort: { column: "number", direction: "desc" },
    page: 0,
    pageSize: HEADER_LIMIT,
  });
  return result.rows.map(toHeaderReservation);
}

export async function fetchHeaderSearch(
  q: string,
  tab: HeaderSearchTab,
  guids?: MatchingGuids,
): Promise<HeaderSearchResult[]> {
  const filters = buildFilters(q, guids);

  if (tab === "drawings") return fetchDocuments("drawings", filters);
  if (tab === "documents") return fetchDocuments("documents", filters);
  if (tab === "reservations") return fetchReservations(q);

  const [drawings, documents, reservations] = await Promise.all([
    fetchDocuments("drawings", filters),
    fetchDocuments("documents", filters),
    fetchReservations(q),
  ]);
  const merged: HeaderSearchResult[] = [...drawings, ...documents, ...reservations];
  merged.sort((a, b) => {
    const labelA = a.kind === "document" ? a.documentNumber : a.reservationNumber;
    const labelB = b.kind === "document" ? b.documentNumber : b.reservationNumber;
    return labelA.localeCompare(labelB);
  });
  return merged.slice(0, HEADER_LIMIT);
}

/** @deprecated Use fetchHeaderSearch */
export const fetchHeaderDocuments = fetchHeaderSearch;
export type { HeaderDocumentResult as LegacyHeaderDocumentResult };
