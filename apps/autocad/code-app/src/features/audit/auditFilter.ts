export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type AppliedFilters = {
  dateFrom: string;
  dateTo: string;
  filterEvent: string;
  filterTable: string;
  filterSubjectId: string;
  filterSource: string;
};

// Dataverse OData: DateTimeOffset literals are unquoted (quoting them is a type
// mismatch error). Subject ID / table are text fields, so they stay quoted.
export function buildAuditFilter(f: AppliedFilters): string | undefined {
  const clauses: string[] = [];
  if (f.dateFrom && ISO_DATE.test(f.dateFrom)) clauses.push(`createdon ge ${f.dateFrom}T00:00:00Z`);
  if (f.dateTo && ISO_DATE.test(f.dateTo))     clauses.push(`createdon le ${f.dateTo}T23:59:59Z`);
  if (f.filterEvent)     clauses.push(`enmax_acdnevent eq ${f.filterEvent}`);
  if (f.filterTable)     clauses.push(`enmax_acdnsubjecttable eq '${f.filterTable.replace(/'/g, "''")}'`);
  if (f.filterSubjectId) clauses.push(`enmax_acdnsubjectid eq '${f.filterSubjectId.replace(/'/g, "''")}'`);
  if (f.filterSource)    clauses.push(`enmax_acdnsource eq ${f.filterSource}`);
  return clauses.length ? clauses.join(" and ") : undefined;
}
