import type { ReactElement, ReactNode } from "react";
import type { QueryKey } from "@tanstack/react-query";

export interface GridFetchParams {
  search: string;
  filters: Record<string, FilterValue>;
  sort: { column: string; direction: "asc" | "desc" } | null;
  page: number;
  pageSize: number;
  /**
   * Dataverse paging cookie for the requested page. The grid supplies the token
   * it received for this page (undefined for page 0). Server-paged fetchers pass
   * it to getAll; client-side fetchers ignore it and slice by `page`.
   */
  skipToken?: string;
}

export type FilterValue = string | string[] | null;

export interface ColumnDef<T> {
  id: string;
  header: string;
  accessor: (row: T) => unknown;
  cell?: (row: T) => ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  filterType?: "text" | "select" | "date" | "people";
  filterOptions?: { value: string; label: string }[];
  exportFormatter?: (value: unknown) => string;
  visibleByDefault?: boolean;
  width?: number | "auto";
  /** When true, cell content may wrap onto multiple lines. Default is single-line with horizontal scroll. */
  wrap?: boolean;
}

export interface RowAction<T> {
  label: string;
  icon?: ReactElement;
  onClick: (row: T) => void;
  hidden?: (row: T) => boolean;
  disabled?: (row: T) => boolean;
}

export interface BulkAction<T> {
  label: string;
  icon?: ReactElement;
  onClick: (rows: T[]) => void;
}

export interface EnmaxDataGridProps<T> {
  queryKey: QueryKey;
  fetcher: (params: GridFetchParams) => Promise<{ rows: T[]; totalCount: number; skipToken?: string }>;
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string;
  rowActions?: RowAction<T>[];
  bulkActions?: BulkAction<T>[];
  /** CSV export toolbar button. Defaults to true (item 11: on every grid, all users). */
  enableExport?: boolean;
  /**
   * Base name for the download. Accepts a prefix (`my-reservations`) or a legacy
   * `*.csv` string. The grid stamps a local timestamp onto the file for emailing
   * (content remains CSV; toolbar label is "Export to Excel").
   */
  exportFileName?: string;
  /** @deprecated Columns dropdown removed — all columns render; prop kept for call-site compat. */
  enableColumnVisibility?: boolean;
  defaultSort?: { column: string; direction: "asc" | "desc" };
  initialPageSize?: number;
  quickSearchPlaceholder?: string;
  emptyMessage?: string;
  emptySubtitle?: string;
  emptyAction?: { label: string; onClick: () => void };
  errorMessage?: string;
  onRowClick?: (row: T) => void;
  enableQuickSearch?: boolean;
  /** When true, the grid does not fetch until the quick-search has >= 2 chars. */
  requireSearch?: boolean;
  /** Prompt shown while requireSearch is active and no query is entered yet. */
  searchPrompt?: string;
  /** When set with totalCount, footer shows "X of Y records" (filtered vs all). */
  allRecordsCount?: number;
}
