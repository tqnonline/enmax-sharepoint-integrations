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
  filterType?: "text" | "select" | "date";
  filterOptions?: { value: string; label: string }[];
  exportFormatter?: (value: unknown) => string;
  visibleByDefault?: boolean;
  width?: number | "auto";
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
  enableExport?: boolean;
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
}
