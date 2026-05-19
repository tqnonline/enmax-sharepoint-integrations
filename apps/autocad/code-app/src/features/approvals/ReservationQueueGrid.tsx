import { useState, useMemo } from "react";
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
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { Warning16Regular } from "@fluentui/react-icons";
import type { PendingReservation } from "./hooks/usePendingReservations";

const useStyles = makeStyles({
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
  searchInput: { maxWidth: "260px" },
});

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
  onBulkApprove: (selected: PendingReservation[]) => void;
}

type SelectionSet = Set<string>;

export function ReservationQueueGrid({ reservations, onSelect, onBulkApprove }: Props) {
  const styles = useStyles();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectionSet>(new Set());

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

  const columns: TableColumnDefinition<PendingReservation>[] = [
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
      renderCell: (r) => <TableCellLayout>{r._createdby_value_Formatted}</TableCellLayout>,
    }),
    createTableColumn<PendingReservation>({
      columnId: "composition",
      renderHeaderCell: () => "Composition",
      renderCell: (r) => (
        <TableCellLayout>
          <Text style={{ fontFamily: "monospace" }}>
            {r.businessCode}-{r.assetCode}-{r.unitCode}-{r.domainCode}-{r.systemCode}-{r.kindCode}-????
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

  const selectedReservations = filtered.filter((r) => selected.has(r.enmax_acdnreservationid));

  return (
    <div>
      <div className={styles.toolbar}>
        <Input
          className={styles.searchInput}
          placeholder="Search by ID, requester, or reason"
          value={search}
          onChange={(_, d) => setSearch(d.value)}
          aria-label="Search reservations"
        />
        {selected.size > 0 && (
          <Button appearance="primary" onClick={() => onBulkApprove(selectedReservations)}>
            Approve selected ({selected.size})
          </Button>
        )}
        <Text size={200} style={{ marginLeft: "auto" }}>
          {filtered.length} pending
        </Text>
      </div>

      <DataGrid
        items={filtered}
        columns={columns}
        sortable
        selectionMode="multiselect"
        getRowId={(r) => r.enmax_acdnreservationid}
        selectedItems={selected}
        onSelectionChange={(_, d) => setSelected(d.selectedItems as SelectionSet)}
        focusMode="composite"
      >
        <DataGridHeader>
          <DataGridRow selectionCell={{ "aria-label": "Select all rows" }}>
            {({ renderHeaderCell }) => (
              <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
            )}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody<PendingReservation>>
          {({ item, rowId }) => (
            <DataGridRow<PendingReservation>
              key={rowId}
              selectionCell={{ "aria-label": "Select row" }}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(item)}
            >
              {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </div>
  );
}
