import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Input,
  Spinner,
  Text,
  Toolbar,
  ToolbarButton,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowSortDownRegular,
  ArrowSortUpRegular,
  ArrowDownloadRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { usePageSize } from "../../config/usePageSize";
import { exportCsvFileName } from "../../lib/formatDateTime";
import { useGridState } from "./useGridState";
import { exportToCsv } from "./csvExport";
import { EmptyState } from "../EmptyState";
import type { ColumnDef, EnmaxDataGridProps } from "./types";
import type { CSSProperties } from "react";

const ROW_HEIGHT = 48;
const OVERSCAN   = 10;
const DEFAULT_COL_MIN = 120;

function columnStyle<T>(col: ColumnDef<T>): CSSProperties | undefined {
  if (col.width === "auto") return undefined;
  if (typeof col.width === "number") {
    return { width: col.width, minWidth: col.width };
  }
  return { minWidth: DEFAULT_COL_MIN };
}

const useStyles = makeStyles({
  root:      { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, height: "100%" },
  toolbar:   { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, alignItems: "center" },
  searchBox: { minWidth: "200px", flex: 1, maxWidth: "360px" },
  spacer:    { flex: 1 },
  tableWrap: {
    flex: 1,
    overflow: "hidden",
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  scrollPort: { overflow: "auto", height: "100%", width: "100%" },
  table: {
    width: "max-content",
    minWidth: "100%",
    borderCollapse: "collapse",
    tableLayout: "auto",
  },
  thead:     { position: "sticky", top: 0, zIndex: 1, background: tokens.colorNeutralBackground3 },
  th: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    textAlign: "left",
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    whiteSpace: "nowrap",
    verticalAlign: "middle",
    userSelect: "none",
  },
  thWrap: {
    whiteSpace: "normal",
    wordBreak: "break-word",
    verticalAlign: "bottom",
  },
  thSortable: { cursor: "pointer", ":hover": { background: tokens.colorNeutralBackground3Hover } },
  thSortIcon: { marginLeft: tokens.spacingHorizontalXS, verticalAlign: "middle" },
  filterRow:  { background: tokens.colorNeutralBackground2 },
  filterCell: {
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXS}`,
    verticalAlign: "top",
    // People picker popover is portaled; still give the cell room so the control isn't crushed.
    minWidth: "160px",
    overflow: "visible",
  },
  tr: {
    ":hover": { background: tokens.colorNeutralBackground2 },
    cursor: "default",
  },
  trClickable: { cursor: "pointer" },
  td: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    verticalAlign: "middle",
  },
  tdWrap: {
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    overflow: "visible",
    textOverflow: "clip",
    verticalAlign: "top",
  },
  actionCol: { width: "120px", minWidth: "120px" },
  pagination: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    justifyContent: "flex-end",
    paddingTop: tokens.spacingVerticalXS,
  },
  emptyCell: { textAlign: "center", padding: tokens.spacingVerticalXL, color: tokens.colorNeutralForeground3 },
});

export function EnmaxDataGrid<T>(props: EnmaxDataGridProps<T>) {
  const {
    queryKey, fetcher, columns, rowKey, rowActions, bulkActions,
    enableExport = true, exportFileName = "export", enableColumnVisibility: _enableColumnVisibility, defaultSort,
    initialPageSize, quickSearchPlaceholder = "Search…",
    emptyMessage = "No results.", emptySubtitle, emptyAction,
    errorMessage = "Failed to load data.",
    onRowClick, enableQuickSearch = true,
    requireSearch = false, searchPrompt = "Enter a search term to begin.",
    allRecordsCount,
  } = props;

  const styles = useStyles();
  const configPageSize = usePageSize();
  const effectivePageSize = initialPageSize ?? configPageSize;

  const { fetchParams, search, page, sortCol, sortDir, setSearch, setPage, setSort } =
    useGridState(defaultSort, effectivePageSize);

  const deferredParams = useDeferredValue(fetchParams);

  // Gate fetching until the user types a query (mirrors header search's >= 2 char threshold).
  const gated = requireSearch && deferredParams.search.trim().length < 2;

  // Dataverse server paging is forward-only via skipToken cookies. Cache the token
  // for each page so prev/next navigation can re-request a page. Reset the chain
  // whenever the query identity (search/filters/sort/pageSize) changes — page 0 has
  // no token. Client-side fetchers ignore the token and slice by `page`.
  const tokenCache = useRef<Map<number, string | undefined>>(new Map([[0, undefined]]));
  const pagingIdentity = JSON.stringify({
    s: deferredParams.search,
    f: deferredParams.filters,
    o: deferredParams.sort,
    ps: deferredParams.pageSize,
  });
  const identityRef = useRef(pagingIdentity);
  if (identityRef.current !== pagingIdentity) {
    identityRef.current = pagingIdentity;
    tokenCache.current = new Map([[0, undefined]]);
  }

  const [searchInput, setSearchInput] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [visibleCols] = useState<Set<string>>(
    () => new Set(columns.filter(c => c.visibleByDefault !== false).map(c => c.id)),
  );
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isPending, isError, isPlaceholderData } = useQuery({
    queryKey: [...(Array.isArray(queryKey) ? queryKey : [queryKey]), deferredParams],
    queryFn: async () => {
      const skipToken = tokenCache.current.get(deferredParams.page);
      const res = await fetcher({ ...deferredParams, skipToken });
      // Stash the cookie that fetches the *next* page (server-paged fetchers only).
      if (res.skipToken) tokenCache.current.set(deferredParams.page + 1, res.skipToken);
      return res;
    },
    placeholderData: prev => prev,
    throwOnError: false,
    enabled: !gated,
  });

  const rows      = data?.rows ?? [];
  const total     = data?.totalCount ?? 0;
  const pageCount = Math.ceil(total / effectivePageSize);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });
  const items = virtualizer.getVirtualItems();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const visibleColumns = columns.filter(c => visibleCols.has(c.id));

  const handleSort = useCallback((colId: string) => {
    if (sortCol === colId) {
      setSort(colId, sortDir === "asc" ? "desc" : "asc");
    } else {
      setSort(colId, "asc");
    }
  }, [sortCol, sortDir, setSort]);

  const toggleRowSelect = useCallback((key: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const allSelected = rows.length > 0 && rows.every(r => selectedRows.has(rowKey(r)));
  const toggleAll = () => {
    if (allSelected) setSelectedRows(new Set());
    else setSelectedRows(new Set(rows.map(r => rowKey(r))));
  };

  async function handleExport() {
    setExporting(true);
    try {
      const prefix = exportFileName.replace(/\.csv$/i, "") || "export";
      await exportToCsv(visibleColumns, fetcher, deferredParams, 10000, exportCsvFileName(prefix));
    } finally {
      setExporting(false);
    }
  }

  const selectedRowObjects = rows.filter(r => selectedRows.has(rowKey(r)));

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        {enableQuickSearch && (
          <Input
            className={styles.searchBox}
            contentBefore={<SearchRegular />}
            placeholder={quickSearchPlaceholder}
            value={searchInput}
            onChange={(_, d) => setSearchInput(d.value)}
            aria-label="Quick search"
          />
        )}

        <div className={styles.spacer} />

        {bulkActions && bulkActions.length > 0 &&
          bulkActions.map(action => (
            <Button
              key={action.label}
              icon={action.icon ?? undefined}
              disabled={selectedRowObjects.length === 0}
              onClick={() => action.onClick(selectedRowObjects)}
            >
              {action.label}
              {selectedRowObjects.length > 0 ? ` (${selectedRowObjects.length})` : ""}
            </Button>
          ))
        }

        {enableExport && (
          <Button
            icon={<ArrowDownloadRegular />}
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            {exporting ? "Exporting…" : "Export to Excel"}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <div
          className={styles.scrollPort}
          ref={scrollRef}
          style={{ opacity: isPlaceholderData ? 0.6 : 1, transition: "opacity 120ms ease" }}
        >
          {gated && <EmptyState title={searchPrompt} icon={<SearchRegular />} />}
          {!gated && isPending && <Spinner label="Loading…" style={{ margin: tokens.spacingVerticalL }} />}
          {!gated && isError && !isPending && (
            <Text style={{ padding: tokens.spacingVerticalM, color: tokens.colorPaletteRedForeground1 }}>
              {errorMessage}
            </Text>
          )}
          {!gated && !isPending && !isError && (
            <table className={styles.table} role="grid" aria-rowcount={total}>
              <thead className={styles.thead}>
                <tr>
                  {(bulkActions?.length ?? 0) > 0 && (
                    <th className={styles.th} style={{ width: 40 }}>
                      <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                    </th>
                  )}
                  {visibleColumns.map(col => (
                    <th
                      key={col.id}
                      className={`${styles.th} ${col.wrap ? styles.thWrap : ""} ${col.sortable ? styles.thSortable : ""}`}
                      style={columnStyle(col)}
                      onClick={() => col.sortable && handleSort(col.id)}
                      aria-sort={sortCol === col.id ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                    >
                      {col.header}
                      {col.sortable && sortCol === col.id && (
                        <span className={styles.thSortIcon}>
                          {sortDir === "asc" ? <ArrowSortUpRegular /> : <ArrowSortDownRegular />}
                        </span>
                      )}
                    </th>
                  ))}
                  {(rowActions?.length ?? 0) > 0 && <th className={`${styles.th} ${styles.actionCol}`}>Actions</th>}
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns.length + 2} className={styles.emptyCell}>
                      <EmptyState
                        title={emptyMessage}
                        subtitle={emptySubtitle}
                        actionLabel={emptyAction?.label}
                        onAction={emptyAction?.onClick}
                      />
                    </td>
                  </tr>
                )}
                {/* Top spacer — virtual rows above the visible window */}
                {items.length > 0 && items[0].start > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={visibleColumns.length + 2} style={{ height: items[0].start, padding: 0, border: "none" }} />
                  </tr>
                )}
                {items.map(vRow => {
                  const row        = rows[vRow.index];
                  const key        = rowKey(row);
                  const isSelected = selectedRows.has(key);
                  return (
                    <tr
                      key={key}
                      data-index={vRow.index}
                      ref={virtualizer.measureElement}
                      className={`${styles.tr} ${onRowClick ? styles.trClickable : ""}`}
                      style={{ background: isSelected ? tokens.colorNeutralBackground2Selected : undefined }}
                      onClick={() => onRowClick?.(row)}
                      aria-rowindex={vRow.index + 2}
                    >
                      {(bulkActions?.length ?? 0) > 0 && (
                        <td className={styles.td} style={{ width: 40 }}>
                          <Checkbox
                            checked={isSelected}
                            onChange={e => { e.stopPropagation(); toggleRowSelect(key); }}
                            aria-label="Select row"
                          />
                        </td>
                      )}
                    {visibleColumns.map(col => (
                      <td key={col.id} className={`${styles.td} ${col.wrap ? styles.tdWrap : ""}`} style={columnStyle(col)}>
                        {col.cell ? col.cell(row) : String(col.accessor(row) ?? "")}
                      </td>
                    ))}
                      {rowActions && rowActions.length > 0 && (
                        <td className={`${styles.td} ${styles.actionCol}`} onClick={e => e.stopPropagation()}>
                          <Toolbar size="small">
                            {rowActions
                              .filter(a => !a.hidden?.(row))
                              .map(action => (
                                <ToolbarButton
                                  key={action.label}
                                  icon={action.icon ?? undefined}
                                  disabled={action.disabled?.(row)}
                                  onClick={() => action.onClick(row)}
                                  aria-label={action.label}
                                  title={action.label}
                                />
                              ))}
                          </Toolbar>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {/* Bottom spacer — virtual rows below the visible window */}
                {items.length > 0 && (() => {
                  const last = items[items.length - 1];
                  const bottomHeight = virtualizer.getTotalSize() - last.start - last.size;
                  return bottomHeight > 0 ? (
                    <tr aria-hidden="true">
                      <td colSpan={visibleColumns.length + 2} style={{ height: bottomHeight, padding: 0, border: "none" }} />
                    </tr>
                  ) : null;
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pagination */}
      {!gated && pageCount > 1 && (
        <div className={styles.pagination}>
          <Text size={200}>{recordCountLabel(total, allRecordsCount)}</Text>
          <Button size="small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <Text size={200}>Page {page + 1} of {pageCount}</Text>
          <Button size="small" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      {!gated && pageCount <= 1 && total > 0 && (
        <div className={styles.pagination}>
          <Text size={200}>{recordCountLabel(total, allRecordsCount)}</Text>
        </div>
      )}
    </div>
  );
}

function recordCountLabel(filtered: number, all?: number): string {
  if (all != null && all !== filtered) {
    return `${filtered} of ${all} record${all !== 1 ? "s" : ""}`;
  }
  return `${filtered} record${filtered !== 1 ? "s" : ""}`;
}
