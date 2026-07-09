import { useCallback, useMemo } from "react";
import { Text, tokens } from "@fluentui/react-components";
import { EnmaxDataGrid, peopleFilterIds } from "../../components/DataGrid";
import type { GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { usePageSize } from "../../config/usePageSize";
import type { CheckinRow } from "./hooks/useCheckins";
import { checkoutRequestColumns } from "./approvalQueueColumns";

interface Props {
  /** Pre-filtered to Requested(6) checkouts by the caller. */
  requests: CheckinRow[];
  onBulkApproveByBatch?: (rows: CheckinRow[]) => void;
  bulkSubmitting?: boolean;
  allRecordsCount?: number;
}

export function CheckoutRequestQueueGrid({ requests, onBulkApproveByBatch, bulkSubmitting, allRecordsCount }: Props) {
  const pageSize = usePageSize();
  const columns = useMemo(() => checkoutRequestColumns(), []);

  const fetcher = useCallback(
    async (params: GridFetchParams): Promise<{ rows: CheckinRow[]; totalCount: number }> =>
      clientPage(requests, params, {
        filterText: {
          documentDisplayNumber: (r) => r.documentDisplayNumber || r.drawingNumber || "",
        },
        filterIds: {
          submittedBy: peopleFilterIds.submittedBy,
        },
      }),
    [requests],
  );

  const queryKey = useMemo(
    () => ["checkout-request-queue", requests.map((r) => r.checkoutId).join(",")],
    [requests],
  );

  return (
    <div style={{ flex: "1 0 auto", minHeight: "400px" }}>
      <EnmaxDataGrid
        queryKey={queryKey}
        fetcher={fetcher}
        columns={columns}
        rowKey={(r) => r.checkoutId}
        bulkActions={onBulkApproveByBatch ? [{
          label: bulkSubmitting ? "Approving…" : "Approve by batch",
          onClick: (rows) => {
            if (!bulkSubmitting) onBulkApproveByBatch(rows);
          },
        }] : undefined}
        enableQuickSearch={false}
        initialPageSize={pageSize}
        defaultSort={{ column: "submittedOn", direction: "desc" }}
        emptyMessage="No Check Out requests awaiting approval."
        errorMessage="Failed to load Check Out requests."
        exportFileName="checkout-requests.csv"
        allRecordsCount={allRecordsCount}
      />
      {requests.length === 0 && (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: "block", marginTop: tokens.spacingVerticalS }}>
          Requests appear here when a user checks out a drawing or document.
        </Text>
      )}
    </div>
  );
}
