import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Select,
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
  FilterRegular,
  SearchRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import { useUserRole } from "../../auth/useUserRole";
import { usePageSize } from "../../config/usePageSize";
import { useGridState } from "./useGridState";
import { exportToCsv } from "./csvExport";
import { EmptyState } from "../EmptyState";
import type { ColumnDef, EnmaxDataGridProps, FilterValue } from "./types";

const ROW_HEIGHT = 40;
const OVERSCAN   = 10;

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
  table:     { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" },
  thead:     { position: "sticky", top: 0, zIndex: 1, background: tokens.colorNeutralBackground3 },
  th: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    textAlign: "left",
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    whiteSpace: "nowrap",
    userSelect: "none",
  },
  thSortable: { cursor: "pointer", ":hover": { background: tokens.colorNeutralBackground3Hover } },
  thSortIcon: { marginLeft: tokens.spacingHorizontalXS, verticalAlign: "middle" },
  filterRow:  { background: tokens.colorNeutralBackground2 },
  filterCell: { padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXS}` },
  tr: {
    ":hover": { background: tokens.colorNeutralBackground2 },
    cursor: "default",
  },
  trClickable: { cursor: "pointer" },
  td: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  actionCol: { width: "120px" },
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
    enableExport, enableColumnVisibility, defaultSort,
    initialPageSize, quickSearchPlaceholder = "Search…",
    emptyMessage = "No results.", emptySubtitle, emptyAction,
    errorMessage = "Failed to load data.",
    onRowClick, enableQuickSearch = true,
    requireSearch = false, searchPrompt = "Enter a search term to begin.",
  } = props;

  const styles = useStyles();
  const { role } = useUserRole();
  const isAdmin = role === "Admin";
  const configPageSize = usePageSize();
  const effectivePageSize = initialPageSize ?? configPageSize;

  const { fetchParams, search, page, sortCol, sortDir, filters, setSearch, setPage, setSort, setFilter } =
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

  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(columns.filter(c => c.visibleByDefault !== false).map(c => c.id)),
  );
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isPending, isError } = useQuery({
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
      await exportToCsv(visibleColumns, fetcher, deferredParams, 10000, "export.csv");
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

        {bulkActions && bulkActions.length > 0 && selectedRowObjects.length > 0 &&
          bulkActions.map(action => (
            <Button key={action.label} icon={action.icon ?? undefined} onClick={() => action.onClick(selectedRowObjects)}>
              {action.label} ({selectedRowObjects.length})
            </Button>
          ))
        }

        <div className={styles.spacer} />

        {enableExport && isAdmin && (
          <Button
            icon={<ArrowDownloadRegular />}
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        )}

        {enableColumnVisibility && (
          <Menu>
            <MenuTrigger>
              <MenuButton icon={<FilterRegular />}>Columns</MenuButton>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {columns.map(col => (
                  <MenuItem
                    key={col.id}
                    checkmark={visibleCols.has(col.id)
                      ? <Checkbox checked={true} aria-hidden="true" />
                      : <Checkbox checked={false} aria-hidden="true" />}
                    onClick={() => setVisibleCols(prev => {
                      const next = new Set(prev);
                      if (next.has(col.id)) next.delete(col.id); else next.add(col.id);
                      return next;
                    })}
                  >
                    {col.header}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
        )}
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <div className={styles.scrollPort} ref={scrollRef}>
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
                      className={`${styles.th} ${col.sortable ? styles.thSortable : ""}`}
                      style={col.width && col.width !== "auto" ? { width: col.width } : undefined}
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

                {/* Filter row */}
                {visibleColumns.some(c => c.filterable) && (
                  <tr className={styles.filterRow}>
                    {(bulkActions?.length ?? 0) > 0 && <td className={styles.filterCell} />}
                    {visibleColumns.map(col => (
                      <td key={col.id} className={styles.filterCell}>
                        {col.filterable && renderFilterCell(col, filters[col.id] ?? null, val => setFilter(col.id, val))}
                      </td>
                    ))}
                    {(rowActions?.length ?? 0) > 0 && <td className={styles.filterCell} />}
                  </tr>
                )}
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
                        <td key={col.id} className={styles.td}>
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
          <Text size={200}>{total} results</Text>
          <Button size="small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <Text size={200}>Page {page + 1} of {pageCount}</Text>
          <Button size="small" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      {!gated && pageCount <= 1 && total > 0 && (
        <div className={styles.pagination}>
          <Text size={200}>{total} result{total !== 1 ? "s" : ""}</Text>
        </div>
      )}
    </div>
  );
}

function renderFilterCell<T>(
  col: ColumnDef<T>,
  value: FilterValue,
  onChange: (val: FilterValue) => void,
) {
  if (col.filterType === "select" && col.filterOptions) {
    const current = Array.isArray(value) ? value[0] : (value ?? "");
    return (
      <Select
        size="small"
        value={current}
        onChange={(_, d) => onChange(d.value || null)}
        aria-label={`Filter ${col.header}`}
      >
        <option value="">All</option>
        {col.filterOptions.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    );
  }

  if (col.filterType === "date") {
    const current = Array.isArray(value) ? value[0] : (value ?? "");
    return (
      <Input
        size="small"
        type="date"
        value={current}
        onChange={(_, d) => onChange(d.value || null)}
        aria-label={`Filter ${col.header}`}
      />
    );
  }

  // text (default)
  const current = Array.isArray(value) ? value[0] : (value ?? "");
  return (
    <Input
      size="small"
      value={current}
      onChange={(_, d) => onChange(d.value || null)}
      contentAfter={current ? (
        <Button
          appearance="transparent"
          size="small"
          icon={<DismissRegular />}
          onClick={() => onChange(null)}
          aria-label="Clear filter"
        />
      ) : undefined}
      aria-label={`Filter ${col.header}`}
    />
  );
}
