import type { MyRecordRow, MyRecordStateFilter } from "./useMyRecords";
import { inIsoDateRange, matchesOptionalPeople, matchesOptionalText } from "../../lib/gridListFilters";
import { defaultGridDateRange } from "../../lib/dateRangeDefaults";
import { DOCUMENT_SUBTYPE_VALUE } from "../reserve/terminology";
import type { DocumentSubtypeFilter } from "../reserve/taxonomyFilters";

export interface MyRecordListFilters {
  number: string;
  from: string;
  to: string;
  documentSubtype: DocumentSubtypeFilter;
  /** When non-empty, row must match at least one person id (submitter or approver column). */
  peopleIds: string[];
}

/**
 * My Reservations tab uses the standard 30-day window.
 * Available / Pending / Checked Out are user-scoped work queues — default unbounded
 * so issued drawing/procedure sheets are not hidden by stale activity dates in DEV.
 */
export function defaultMyItemsListFilters(
  state: MyRecordStateFilter = "reservations",
  now = new Date(),
): MyRecordListFilters {
  if (state === "reservations") {
    const { from, to } = defaultGridDateRange(now);
    return { number: "", from, to, documentSubtype: "all", peopleIds: [] };
  }
  return { number: "", from: "", to: "", documentSubtype: "all", peopleIds: [] };
}

export function rowDateForState(row: MyRecordRow, state: MyRecordStateFilter): string {
  if (state === "reservations") return row.createdOn;
  if (state === "pendingapproval") {
    return row.checkedOutOn || row.createdOn || row.revisionDate;
  }
  if (state === "checkedout") {
    return row.checkedOutOn || row.createdOn || row.revisionDate;
  }
  // Available: last check-in is the meaningful activity date.
  return row.checkedInOn || row.createdOn || row.revisionDate;
}

function rowMatchesSubtype(row: MyRecordRow, subtype: DocumentSubtypeFilter): boolean {
  if (subtype === "all") return true;
  if (subtype === "standard") {
    return row.enmax_acdndocumentsubtype === DOCUMENT_SUBTYPE_VALUE.Standard;
  }
  return row.enmax_acdndocumentsubtype === DOCUMENT_SUBTYPE_VALUE.Procedure;
}

function matchesPeople(peopleIds: string[], row: MyRecordRow): boolean {
  return matchesOptionalPeople(peopleIds, row.submittedById, row.approvedById);
}

function rowMatchesNumber(row: MyRecordRow, needle: string, displayNumber: string): boolean {
  return matchesOptionalText(
    needle,
    displayNumber,
    row.number,
    row.reservationNumber,
    row.title,
    row.baseNumber,
  );
}

/** Client-side top-bar filters applied before grid paging. */
export function applyMyRecordListFilters(
  rows: MyRecordRow[],
  filters: MyRecordListFilters,
  state: MyRecordStateFilter,
  displayNumberFor: (row: MyRecordRow) => string,
): MyRecordRow[] {
  const needle = filters.number.trim().toLowerCase();

  return rows.filter((row) => {
    if (!rowMatchesSubtype(row, filters.documentSubtype)) return false;
    if (!matchesPeople(filters.peopleIds ?? [], row)) return false;
    const dateIso = rowDateForState(row, state);
    if (!inIsoDateRange(dateIso, filters.from, filters.to)) return false;
    return rowMatchesNumber(row, needle, displayNumberFor(row));
  });
}
