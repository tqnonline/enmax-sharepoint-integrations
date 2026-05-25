import type { ColumnDef, GridFetchParams } from "./types";

export async function exportToCsv<T>(
  columns: ColumnDef<T>[],
  fetcher: (params: GridFetchParams) => Promise<{ rows: T[]; totalCount: number; skipToken?: string }>,
  fetchParams: GridFetchParams,
  maxRows: number,
  filename: string,
): Promise<void> {
  const exportCols = columns;
  const header = exportCols.map(c => `"${c.header.replace(/"/g, '""')}"`).join(",");

  const allRows: T[] = [];
  let page = 0;
  const pageSize = 500;
  // Server-paged fetchers ignore `page` and page off skipToken (Dataverse rejects
  // $skip); client-side fetchers ignore skipToken and slice by `page`. Threading
  // both keeps export correct for either kind.
  let skipToken: string | undefined;

  while (allRows.length < maxRows) {
    const res = await fetcher({ ...fetchParams, page, pageSize, skipToken });
    allRows.push(...res.rows);
    if (allRows.length >= res.totalCount || res.rows.length < pageSize) break;
    skipToken = res.skipToken;
    page++;
  }

  const csvRows = allRows.slice(0, maxRows).map(row => {
    return exportCols.map(col => {
      const val = col.exportFormatter
        ? col.exportFormatter(col.accessor(row))
        : String(col.accessor(row) ?? "");
      return `"${val.replace(/"/g, '""')}"`;
    }).join(",");
  });

  const csv = [header, ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
