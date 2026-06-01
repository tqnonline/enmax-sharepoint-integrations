import { useCallback, useMemo, useState } from "react";
import { Persona, Text, Input, Field, tokens, makeStyles } from "@fluentui/react-components";
import { EnmaxDataGrid } from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { usePageSize } from "../../config/usePageSize";
import { ValidationDrawer } from "../checkout/components/ValidationDrawer";
import { DrawingState } from "../checkout/api/checkoutClient";
import type { CheckinRow } from "./hooks/useCheckins";

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const COLUMNS: ColumnDef<CheckinRow>[] = [
  {
    id: "drawingNumber", header: "Drawing", accessor: (r) => r.drawingNumber, sortable: true, filterable: true,
    cell: (r) => <Text style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.drawingNumber || "—"}</Text>,
  },
  {
    id: "submittedByName", header: "Submitted by", accessor: (r) => r.submittedByName, sortable: true, filterable: true,
    cell: (r) => <Persona name={r.submittedByName || "Unknown"} size="small" />,
  },
  { id: "newRevision", header: "New rev", accessor: (r) => r.newRevision, sortable: true, width: 100 },
  {
    id: "submittedOn", header: "Submitted", accessor: (r) => r.submittedOn, sortable: true, width: 150,
    cell: (r) => <>{fmtDate(r.submittedOn)}</>,
  },
  {
    id: "actions", header: "Actions", accessor: () => "", width: 160,
    cell: (r) => (
      <ValidationDrawer
        checkout={{ id: r.checkoutId, checkedOutBy: r.submittedById, checkedOutOn: r.submittedOn, newRevision: r.newRevision, newPdfUrls: r.newPdfUrls }}
        drawing={{ id: r.drawingId, state: DrawingState.AwaitingValidation, number: r.drawingNumber, currentRevision: r.currentRevision, missingSheets: r.missingSheets, spLibraryUrl: r.spLibraryUrl }}
      />
    ),
  },
];

const useStyles = makeStyles({
  filters: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    alignItems: "flex-end",
    marginBottom: tokens.spacingVerticalS,
    flexWrap: "wrap",
  },
});

interface Props {
  checkins: CheckinRow[];
}

export function CheckinQueueGrid({ checkins }: Props) {
  const styles = useStyles();
  const pageSize = usePageSize();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    const fromMs = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY;
    const toMs = to ? new Date(to).getTime() + 86_400_000 : Number.POSITIVE_INFINITY; // inclusive end-of-day
    return checkins.filter((c) => {
      const t = c.submittedOn ? new Date(c.submittedOn).getTime() : 0;
      return t >= fromMs && t <= toMs;
    });
  }, [checkins, from, to]);

  const fetcher = useCallback(
    async (params: GridFetchParams): Promise<{ rows: CheckinRow[]; totalCount: number }> =>
      clientPage(filtered, params, { searchText: (r) => [r.drawingNumber, r.submittedByName, r.newRevision] }),
    [filtered],
  );

  const queryKey = useMemo(
    () => ["checkin-queue", from, to, filtered.map((c) => c.checkoutId).join(",")],
    [from, to, filtered],
  );

  return (
    <div style={{ flex: "1 0 auto", minHeight: "500px" }}>
      <div className={styles.filters}>
        <Field label="From"><Input type="date" value={from} onChange={(_, d) => setFrom(d.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(_, d) => setTo(d.value)} /></Field>
      </div>
      <EnmaxDataGrid
        queryKey={queryKey}
        fetcher={fetcher}
        columns={COLUMNS}
        rowKey={(r) => r.checkoutId}
        enableColumnVisibility
        initialPageSize={pageSize}
        defaultSort={{ column: "submittedOn", direction: "desc" }}
        emptyMessage="No check-ins awaiting validation."
        errorMessage="Failed to load check-ins."
      />
    </div>
  );
}
