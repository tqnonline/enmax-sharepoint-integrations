import type { MyRecordRow, MyRecordStateFilter } from "./useMyRecords";
import { inIsoDateRange, matchesOptionalPeople, matchesOptionalText, normalizeGridDateRange } from "../../lib/gridListFilters";
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

/** All My Items tabs default to today − fromDays through today (App Config GridDefaultFromDays). */
export function defaultMyItemsListFilters(
  state: MyRecordStateFilter = "reservations",
  now = new Date(),
  fromDays?: number,
): MyRecordListFilters {
  void state;
  const { from, to } = defaultGridDateRange(now, fromDays);
  return { number: "", from, to, documentSubtype: "all", peopleIds: [] };
}

/** Latest ISO timestamp among non-empty values (chronological sort). */
function latestIsoDate(...values: (string | undefined)[]): string {
  const present = values.filter((v): v is string => !!v);
  if (present.length === 0) return "";
  return present.sort((a, b) => a.localeCompare(b)).at(-1) ?? "";
}

export function rowDateForState(row: MyRecordRow, state: MyRecordStateFilter): string {
  if (state === "reservations") return row.createdOn;
  if (state === "pendingapproval") {
    return latestIsoDate(row.checkedOutOn, row.revisionDate, row.createdOn);
  }
  if (state === "checkedout") {
    return latestIsoDate(row.checkedOutOn, row.revisionDate, row.createdOn);
  }
  // Available: any recent activity (check-in, update, or create) counts for the date window.
  return latestIsoDate(row.checkedInOn, row.revisionDate, row.createdOn);
}

function rowMatchesSubtype(row: MyRecordRow, subtype: DocumentSubtypeFilter): boolean {
  if (subtype === "all") return true;
  if (subtype === "standard") {
    return row.enmax_acdndocumentsubtype === DOCUMENT_SUBTYPE_VALUE.Standard;
  }
  if (subtype === "procedure") {
    return row.enmax_acdndocumentsubtype === DOCUMENT_SUBTYPE_VALUE.Procedure;
  }
  if (subtype === "form") {
    return row.enmax_acdndocumentsubtype === DOCUMENT_SUBTYPE_VALUE.Form;
  }
  return false;
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
  const { from, to } = normalizeGridDateRange(filters.from, filters.to);
  const needle = filters.number.trim().toLowerCase();

  return rows.filter((row) => {
    if (!rowMatchesSubtype(row, filters.documentSubtype)) return false;
    if (!matchesPeople(filters.peopleIds ?? [], row)) return false;
    const dateIso = rowDateForState(row, state);
    if (!inIsoDateRange(dateIso, from, to)) return false;
    return rowMatchesNumber(row, needle, displayNumberFor(row));
  });
}
