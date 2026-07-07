import { useCallback, useMemo } from "react";
import { Persona, Text, tokens } from "@fluentui/react-components";
import { EnmaxDataGrid } from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { usePageSize } from "../../config/usePageSize";
import { CheckoutApprovalDrawer } from "../checkout/components/CheckoutApprovalDrawer";
import type { CheckinRow } from "./hooks/useCheckins";

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

interface Props {
  /** Pre-filtered to Requested(6) checkouts by the caller. */
  requests: CheckinRow[];
}

/**
 * WS3 gated Check Out approval queue. Lists pending Check Out requests (checkout status
 * Requested) and lets an Approver/Admin approve or decline each one.
 */
export function CheckoutRequestQueueGrid({ requests }: Props) {
  const pageSize = usePageSize();

  const columns = useMemo<ColumnDef<CheckinRow>[]>(
    () => [
      {
        id: "drawingNumber", header: "Drawing", accessor: (r) => r.drawingNumber, sortable: true,
        cell: (r) => <Text style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.drawingNumber || "—"}</Text>,
      },
      {
        id: "submittedByName", header: "Requested by", accessor: (r) => r.submittedByName, sortable: true,
        cell: (r) => <Persona name={r.submittedByName || "Unknown"} size="small" />,
      },
      {
        id: "submittedOn", header: "Requested", accessor: (r) => r.submittedOn, sortable: true, width: 160,
        cell: (r) => <>{fmtDate(r.submittedOn)}</>,
      },
      {
        id: "actions", header: "Actions", accessor: () => "", width: 180,
        cell: (r) => (
          <CheckoutApprovalDrawer
            checkoutId={r.checkoutId}
            drawingNumber={r.drawingNumber}
            requestedByName={r.submittedByName}
          />
        ),
      },
    ],
    [],
  );

  const fetcher = useCallback(
    async (params: GridFetchParams): Promise<{ rows: CheckinRow[]; totalCount: number }> =>
      clientPage(requests, params),
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
        enableColumnVisibility
        enableQuickSearch={false}
        initialPageSize={pageSize}
        defaultSort={{ column: "submittedOn", direction: "desc" }}
        emptyMessage="No Check Out requests awaiting approval."
        errorMessage="Failed to load Check Out requests."
      />
      {requests.length === 0 && (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: "block", marginTop: tokens.spacingVerticalS }}>
          Requests appear here as soon as a user asks to check out a drawing.
        </Text>
      )}
    </div>
  );
}
