import { formatReservationDisplay } from "./compositionUtils";
import type { PendingReservation } from "./hooks/usePendingReservations";
import type { CheckinRow } from "./hooks/useCheckins";

export interface ApprovalListFilters {
  number: string;
  from: string;
  to: string;
  /** When non-empty, row must match at least one person id (submitter or approver). */
  peopleIds: string[];
}

import { inIsoDateRange, matchesOptionalPeople } from "../../lib/gridListFilters";

export function applyReservationApprovalFilters(
  rows: PendingReservation[],
  filters: ApprovalListFilters,
): PendingReservation[] {
  const needle = filters.number.trim().toLowerCase();

  return rows.filter((row) => {
    if (!inIsoDateRange(row.createdon, filters.from, filters.to)) return false;
    if (!matchesOptionalPeople(filters.peopleIds, row.submittedById, row.approvedById)) return false;
    if (!needle) return true;
    const haystack = [
      row.enmax_acdnreservationnumber ?? "",
      row.enmax_acdnreason ?? "",
      row.submittedByName ?? "",
      row.approvedByName ?? "",
      formatReservationDisplay({
        ...row,
        enmax_acdnissuednumbers: row.enmax_acdnissuednumbers,
        appendFirst: row.appendFirst,
        appendLast: row.appendLast,
        targetDrawingId: row.targetDrawingId,
        sequenceType: row.sequenceType,
      }),
    ].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}

export function applyCheckinApprovalFilters(
  rows: CheckinRow[],
  filters: ApprovalListFilters,
): CheckinRow[] {
  const needle = filters.number.trim().toLowerCase();

  return rows.filter((row) => {
    if (!inIsoDateRange(row.submittedOn, filters.from, filters.to)) return false;
    if (!matchesOptionalPeople(filters.peopleIds, row.submittedById, row.approvedById)) return false;
    if (!needle) return true;
    const haystack = [
      row.documentDisplayNumber ?? "",
      row.drawingNumber ?? "",
      row.submittedByName ?? "",
      row.approvedByName ?? "",
      row.typeLabel ?? "",
    ].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}
