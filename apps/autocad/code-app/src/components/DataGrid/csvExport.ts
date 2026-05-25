import type { ColumnDef, GridFetchParams } from "./types";

export async function exportToCsv<T>(
  columns: ColumnDef<T>[],
  fetcher: (params: GridFetchParams) => Promise<{ rows: T[]; totalCount: number }>,
  fetchParams: GridFetchParams,
  maxRows: number,
  filename: string,
): Promise<void> {
  const exportCols = columns;
  const header = exportCols.map(c => `"${c.header.replace(/"/g, '""')}"`).join(",");

  const allRows: T[] = [];
  let page = 0;
  const pageSize = 500;

  while (allRows.length < maxRows) {
    const { rows, totalCount } = await fetcher({ ...fetchParams, page, pageSize });
    allRows.push(...rows);
    if (allRows.length >= totalCount || rows.length < pageSize) break;
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
