import { useCallback, useMemo } from "react";
import {
  Badge,
  Persona,
  Text,
} from "@fluentui/react-components";
import { Warning16Regular } from "@fluentui/react-icons";
import { EnmaxDataGrid } from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import type { PendingReservation } from "./hooks/usePendingReservations";
import { formatComposition } from "./compositionUtils";
import { usePageSize } from "../../config/usePageSize";

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
  onBulkApprove?: (selected: PendingReservation[]) => void;
  emptyMessage?: string;
  countLabel?: string;
}

const COLUMNS: ColumnDef<PendingReservation>[] = [
  {
    id: "enmax_acdnreservationnumber", header: "ID",
    accessor: r => r.enmax_acdnreservationnumber,
    sortable: true, filterable: true,
  },
  {
    id: "requester", header: "Requester",
    accessor: r => r._createdby_value_Formatted,
    sortable: true,
    cell: r => (
      <Persona
        name={r._createdby_value_Formatted}
        secondaryText={r.createdByJobTitle || undefined}
        size="small"
      />
    ),
  },
  {
    id: "composition", header: "Composition",
    accessor: r => formatComposition(r),
    cell: r => (
      <Text style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
        {formatComposition(r)}
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
  {
    id: "reason", header: "Reason",
    accessor: r => r.enmax_acdnreason ?? "",
    cell: r => (
      <Text title={r.enmax_acdnreason}>
        {r.enmax_acdnreason?.slice(0, 80)}{(r.enmax_acdnreason?.length ?? 0) > 80 ? "…" : ""}
      </Text>
    ),
  },
  {
    id: "createdon", header: "Submitted",
    accessor: r => r.createdon,
    sortable: true,
    width: 120,
    cell: r => <>{relativeTime(r.createdon)}</>,
  },
];

export function ReservationQueueGrid({ reservations, onSelect, onBulkApprove, emptyMessage }: Props) {
  const pageSize = usePageSize();

  const fetcher = useCallback(
    async (params: GridFetchParams): Promise<{ rows: PendingReservation[]; totalCount: number }> =>
      clientPage(reservations, params, {
        searchText: r => [
          r.enmax_acdnreservationnumber ?? "",
          r._createdby_value_Formatted ?? "",
          r.enmax_acdnreason ?? "",
        ],
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
        initialPageSize={pageSize}
        defaultSort={{ column: "createdon", direction: "desc" }}
        emptyMessage={emptyMessage ?? "No reservations found."}
        errorMessage="Failed to load reservations."
      />
    </div>
  );
}
