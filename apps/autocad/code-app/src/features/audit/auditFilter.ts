export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type AppliedFilters = {
  dateFrom: string;
  dateTo: string;
  filterEvent: string;
  filterTable: string;
  filterSubjectId: string;
  filterSource: string;
  peopleIds: string[];
};

// Dataverse OData: DateTimeOffset literals are unquoted (quoting them is a type
// mismatch error). Subject ID / table are text fields, so they stay quoted.
export function buildAuditFilter(f: AppliedFilters): string | undefined {
  const clauses: string[] = [];
  if (f.dateFrom && ISO_DATE.test(f.dateFrom)) clauses.push(`createdon ge ${f.dateFrom}T00:00:00Z`);
  if (f.dateTo && ISO_DATE.test(f.dateTo))     clauses.push(`createdon le ${f.dateTo}T23:59:59Z`);
  // event/source are option-set codes — coerce to a number so only a numeric literal
  // is ever injected unquoted (defense-in-depth if this is reused with looser input).
  const ev = Number(f.filterEvent);
  if (f.filterEvent && Number.isFinite(ev))  clauses.push(`enmax_acdnevent eq ${ev}`);
  if (f.filterTable)     clauses.push(`enmax_acdnsubjecttable eq '${f.filterTable.replace(/'/g, "''")}'`);
  if (f.filterSubjectId) clauses.push(`enmax_acdnsubjectid eq '${f.filterSubjectId.replace(/'/g, "''")}'`);
  const src = Number(f.filterSource);
  if (f.filterSource && Number.isFinite(src)) clauses.push(`enmax_acdnsource eq ${src}`);
  if (f.peopleIds?.length) {
    const actedBy = f.peopleIds
      .map((id) => `_enmax_acdnactedby_value eq '${id.replace(/'/g, "''")}'`)
      .join(" or ");
    clauses.push(`(${actedBy})`);
  }
  return clauses.length ? clauses.join(" and ") : undefined;
}
