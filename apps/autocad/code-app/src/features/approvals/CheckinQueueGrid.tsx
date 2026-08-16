import { useCallback, useMemo } from "react";
import {
  EnmaxDataGrid,
} from "../../components/DataGrid";
import type { GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { usePageSize } from "../../config/usePageSize";
import { type CheckinRow } from "./hooks/useCheckins";
import { checkinValidationColumns } from "./approvalQueueColumns";

interface Props {
  checkins: CheckinRow[];
  allRecordsCount?: number;
}

export function CheckinQueueGrid({ checkins, allRecordsCount }: Props) {
  const pageSize = usePageSize();

  const columns = useMemo(() => checkinValidationColumns(), []);

  const fetcher = useCallback(
    async (params: GridFetchParams): Promise<{ rows: CheckinRow[]; totalCount: number }> =>
      clientPage(checkins, params),
    [checkins],
  );

  const queryKey = useMemo(
    () => ["checkin-queue", checkins.map((c) => c.checkoutId).join(",")],
    [checkins],
  );

  return (
    <div style={{ flex: "1 0 auto", minHeight: "500px" }}>
      <EnmaxDataGrid
        queryKey={queryKey}
        fetcher={fetcher}
        columns={columns}
        rowKey={(r) => r.checkoutId}
        enableQuickSearch={false}
        exportFileName="check-ins.csv"
        initialPageSize={pageSize}
        defaultSort={{ column: "submittedOn", direction: "desc" }}
        emptyMessage="No Check Ins awaiting validation."
        errorMessage="Failed to load Check Ins."
        allRecordsCount={allRecordsCount}
      />
    </div>
  );
}
