import { useCallback, useMemo } from "react";
import {
  Badge,
  Persona,
  Text,
} from "@fluentui/react-components";
import { Warning16Regular } from "@fluentui/react-icons";
import {
  EnmaxDataGrid,
  approvedByColumn,
  dateTimeColumn,
  peopleFilterIds,
  sharePointColumn,
} from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import type { PendingReservation } from "./hooks/usePendingReservations";
import { formatReservationDisplay } from "./compositionUtils";
import { usePageSize } from "../../config/usePageSize";

interface Props {
  reservations: PendingReservation[];
  onSelect: (reservation: PendingReservation) => void;
  onBulkApprove?: (selected: PendingReservation[]) => void;
  emptyMessage?: string;
  allRecordsCount?: number;
}

const COLUMNS: ColumnDef<PendingReservation>[] = [
  {
    id: "enmax_acdnreservationnumber", header: "Reservation #",
    accessor: r => r.enmax_acdnreservationnumber,
    sortable: true, filterable: true,
  },
  sharePointColumn<PendingReservation>(() => ""),
  {
    id: "reason", header: "Reason",
    accessor: r => r.enmax_acdnreason ?? "",
    filterable: true,
    filterType: "text",
    wrap: true,
    width: 280,
    cell: r => (
      <Text title={r.enmax_acdnreason}>
        {r.enmax_acdnreason?.slice(0, 80)}{(r.enmax_acdnreason?.length ?? 0) > 80 ? "…" : ""}
      </Text>
    ),
  },
  {
    id: "submittedBy",
    header: "Submitted By",
    accessor: r => r.submittedByName,
    sortable: true,
    filterable: true,
    filterType: "people",
    cell: r => (
      <Persona
        name={r.submittedByName}
        secondaryText={r.createdByJobTitle || undefined}
        size="small"
      />
    ),
  },
  {
    id: "typeLabel", header: "Type",
    accessor: r => r.typeLabel,
    sortable: true,
    width: 160,
    cell: r => <Text>{r.typeLabel}</Text>,
  },
  {
    id: "composition", header: "Issued number",
    accessor: r => formatReservationDisplay({
      ...r,
      enmax_acdnissuednumbers: r.enmax_acdnissuednumbers,
      appendFirst: r.appendFirst,
      appendLast: r.appendLast,
      targetDrawingId: r.targetDrawingId,
      sequenceType: r.sequenceType,
    }),
    filterable: true,
    cell: r => (
      <Text style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
        {formatReservationDisplay({
          ...r,
          enmax_acdnissuednumbers: r.enmax_acdnissuednumbers,
          appendFirst: r.appendFirst,
          appendLast: r.appendLast,
          targetDrawingId: r.targetDrawingId,
          sequenceType: r.sequenceType,
        })}
      </Text>
    ),
  },
  {
    id: "enmax_acdndrawingcount", header: "Count",
    accessor: r => r.enmax_acdndrawingcount,
    sortable: true,
    width: 80,
  },
  {
    id: "override", header: "Override",
    accessor: r => r.enmax_acdnoverride ? "Yes" : "No",
    width: 100,
    cell: r => r.enmax_acdnoverride
      ? <Badge icon={<Warning16Regular />} color="warning">Yes</Badge>
      : <>No</>,
    visibleByDefault: false,
  },
  dateTimeColumn<PendingReservation>({
    id: "createdon",
    header: "Submitted On",
    accessor: r => r.createdon,
    width: 160,
  }),
  approvedByColumn<PendingReservation>(),
];

export function ReservationQueueGrid({ reservations, onSelect, onBulkApprove, emptyMessage, allRecordsCount }: Props) {
  const pageSize = usePageSize();

  const fetcher = useCallback(
    async (params: GridFetchParams): Promise<{ rows: PendingReservation[]; totalCount: number }> =>
      clientPage(reservations, params, {
        searchText: r => [
          r.enmax_acdnreservationnumber ?? "",
          r.submittedByName ?? "",
          r.approvedByName ?? "",
          r.enmax_acdnreason ?? "",
        ],
        filterText: {
          enmax_acdnreservationnumber: r => r.enmax_acdnreservationnumber ?? "",
          composition: r => formatReservationDisplay({
            ...r,
            enmax_acdnissuednumbers: r.enmax_acdnissuednumbers,
            appendFirst: r.appendFirst,
            appendLast: r.appendLast,
            targetDrawingId: r.targetDrawingId,
            sequenceType: r.sequenceType,
          }),
        },
        filterIds: {
          submittedBy: peopleFilterIds.submittedBy,
          approvedBy: peopleFilterIds.approvedBy,
        },
      }),
    [reservations],
  );

  const queryKey = useMemo(
    () => ["reservation-queue", reservations.map(r => r.enmax_acdnreservationid).join(",")],
    [reservations],
  );

  const bulkActions = onBulkApprove
    ? [{ label: "Approve selected", onClick: onBulkApprove }]
    : undefined;

  return (
    <div style={{ flex: "1 0 auto", minHeight: "500px" }}>
      <EnmaxDataGrid
        queryKey={queryKey}
        fetcher={fetcher}
        columns={COLUMNS}
        rowKey={r => r.enmax_acdnreservationid}
        onRowClick={onSelect}
        bulkActions={bulkActions}
        enableColumnVisibility
        enableQuickSearch={false}
        exportFileName="reservations.csv"
        initialPageSize={pageSize}
        defaultSort={{ column: "createdon", direction: "desc" }}
        emptyMessage={emptyMessage ?? "No reservations found."}
        errorMessage="Failed to load reservations."
        allRecordsCount={allRecordsCount}
      />
    </div>
  );
}
