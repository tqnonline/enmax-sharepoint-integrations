import React, { useState, useMemo, useEffect } from "react";
import {
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  type TableColumnDefinition,
  createTableColumn,
  TableCellLayout,
  Badge,
  Input,
  Button,
  Text,
  Persona,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { Warning16Regular, ChevronLeft16Regular, ChevronRight16Regular } from "@fluentui/react-icons";
import type { PendingReservation } from "./hooks/usePendingReservations";
import { formatComposition } from "./compositionUtils";

const PAGE_SIZE = 25;

// Column visibility breakpoints:
//   < 900 px  — show: id, requester, composition, reason, submitted
//   900–1023px — + count
//   ≥ 1024 px — all (+ override)
const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", minWidth: 0 },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
    flexWrap: "wrap",
  },
  searchInput: { maxWidth: "420px", minWidth: "240px", flex: "1 1 240px" },
  gridScroll: {
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalM,
    flexWrap: "wrap",
  },
});

function useScreenWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  reservations: PendingReservation[];
  onSelect: (reservation: PendingReservation) => void;
  onBulkApprove?: (selected: PendingReservation[]) => void; // undefined = read-only mode, no checkboxes
}

type SelectionSet = Set<string>;

const ALL_COLUMN_IDS = ["id", "requester", "composition", "count", "override", "reason", "submitted"] as const;
type ColumnId = typeof ALL_COLUMN_IDS[number];

function visibleColumns(screenWidth: number): Set<ColumnId> {
  if (screenWidth >= 1024) return new Set(ALL_COLUMN_IDS);
  if (screenWidth >= 900)  return new Set(["id", "requester", "composition", "count", "reason", "submitted"] as ColumnId[]);
  return new Set(["id", "requester", "composition", "reason", "submitted"] as ColumnId[]);
}

export function ReservationQueueGrid({ reservations, onSelect, onBulkApprove }: Props) {
  const styles = useStyles();
  const screenWidth = useScreenWidth();
  const [search, setSearch]           = useState("");
  const [selected, setSelected]       = useState<SelectionSet>(new Set());
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return reservations;
    return reservations.filter(
      (r) =>
        r.enmax_acdnreservationnumber?.toLowerCase().includes(q) ||
        r._createdby_value_Formatted?.toLowerCase().includes(q) ||
        r.enmax_acdnreason?.toLowerCase().includes(q),
    );
  }, [reservations, search]);

  useEffect(() => { setCurrentPage(1); }, [search]);
  // Clear selection whenever the data source changes (e.g. after approval/refetch)
  useEffect(() => { setSelected(new Set()); }, [reservations]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(currentPage, totalPages);
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const visible = visibleColumns(screenWidth);

  const allColumns: TableColumnDefinition<PendingReservation>[] = [
    createTableColumn<PendingReservation>({
      columnId: "id",
      compare: (a, b) => a.enmax_acdnreservationnumber.localeCompare(b.enmax_acdnreservationnumber),
      renderHeaderCell: () => "ID",
      renderCell: (r) => <TableCellLayout>{r.enmax_acdnreservationnumber}</TableCellLayout>,
    }),
    createTableColumn<PendingReservation>({
      columnId: "requester",
      compare: (a, b) => a._createdby_value_Formatted.localeCompare(b._createdby_value_Formatted),
      renderHeaderCell: () => "Requester",
      renderCell: (r) => (
        <TableCellLayout>
          <Persona
            name={r._createdby_value_Formatted}
            secondaryText={r.createdByJobTitle || undefined}
            size="small"
          />
        </TableCellLayout>
      ),
    }),
    createTableColumn<PendingReservation>({
      columnId: "composition",
      renderHeaderCell: () => "Composition",
      renderCell: (r) => (
        <TableCellLayout>
          <Text style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
            {formatComposition(r)}
          </Text>
        </TableCellLayout>
      ),
    }),
    createTableColumn<PendingReservation>({
      columnId: "count",
      compare: (a, b) => a.enmax_acdndrawingcount - b.enmax_acdndrawingcount,
      renderHeaderCell: () => "Count",
      renderCell: (r) => <TableCellLayout>{r.enmax_acdndrawingcount}</TableCellLayout>,
    }),
    createTableColumn<PendingReservation>({
      columnId: "override",
      renderHeaderCell: () => "Override",
      renderCell: (r) =>
        r.enmax_acdnoverride ? (
          <TableCellLayout>
            <Badge icon={<Warning16Regular />} color="warning">Yes</Badge>
          </TableCellLayout>
        ) : (
          <TableCellLayout>No</TableCellLayout>
        ),
    }),
    createTableColumn<PendingReservation>({
      columnId: "reason",
      renderHeaderCell: () => "Reason",
      renderCell: (r) => (
        <TableCellLayout truncate>
          <Text truncate title={r.enmax_acdnreason}>
            {r.enmax_acdnreason?.slice(0, 80)}{r.enmax_acdnreason?.length > 80 ? "…" : ""}
          </Text>
        </TableCellLayout>
      ),
    }),
    createTableColumn<PendingReservation>({
      columnId: "submitted",
      compare: (a, b) => new Date(b.createdon).getTime() - new Date(a.createdon).getTime(),
      renderHeaderCell: () => "Submitted",
      renderCell: (r) => <TableCellLayout>{relativeTime(r.createdon)}</TableCellLayout>,
    }),
  ];

  const columns = allColumns.filter((c) => visible.has(c.columnId as ColumnId));

  const selectedReservations = filtered.filter((r) => selected.has(r.enmax_acdnreservationid));

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <Input
          className={styles.searchInput}
          placeholder="Search by ID, requester, or reason"
          value={search}
          onChange={(_, d) => setSearch(d.value)}
          aria-label="Search reservations"
        />
        {onBulkApprove && selected.size > 0 && (
          <Button appearance="primary" onClick={() => onBulkApprove(selectedReservations)}>
            Approve selected ({selected.size})
          </Button>
        )}
        <Text size={200} style={{ marginLeft: "auto" }}>
          {filtered.length} pending
        </Text>
      </div>

      <div className={styles.gridScroll}>
        <DataGrid
          items={paged}
          columns={columns}
          sortable
          selectionMode={onBulkApprove ? "multiselect" : undefined}
          getRowId={(r) => r.enmax_acdnreservationid}
          selectedItems={onBulkApprove ? selected : new Set()}
          onSelectionChange={onBulkApprove ? ((_, d) => setSelected(new Set([...(d.selectedItems ?? [])].map(String)))) : undefined}
          focusMode="composite"
          style={{ minWidth: screenWidth < 900 ? "620px" : undefined }}
        >
          <DataGridHeader>
            <DataGridRow selectionCell={onBulkApprove ? { "aria-label": "Select all rows" } : undefined}>
              {({ renderHeaderCell }) => (
                <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<PendingReservation>>
            {({ item, rowId }) => (
              <DataGridRow<PendingReservation>
                key={rowId}
                selectionCell={onBulkApprove ? { "aria-label": "Select row" } : undefined}
                style={{ cursor: "pointer" }}
                onClick={(e: React.MouseEvent) => {
                  // Ignore clicks on the checkbox cell itself
                  if ((e.target as HTMLElement).closest('[role="checkbox"]')) return;
                  // In multi-select mode, row clicks don't open the detail panel
                  if (selected.size > 0) return;
                  onSelect(item);
                }}
              >
                {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <Button
            icon={<ChevronLeft16Regular />}
            appearance="subtle"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          />
          <Text size={200}>
            Page {safePage} of {totalPages}
            {" "}·{" "}
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </Text>
          <Button
            icon={<ChevronRight16Regular />}
            appearance="subtle"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Next page"
          />
        </div>
      )}
    </div>
  );
}
