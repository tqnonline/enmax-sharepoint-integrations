import { useCallback, useMemo, useState } from "react";
import {
  Title2, Text, Badge, Button, Spinner, MessageBar, MessageBarBody, tokens, makeStyles,
} from "@fluentui/react-components";
import { Add20Regular } from "@fluentui/react-icons";
import { EnmaxDataGrid, GridQueryFilterBar, dateTimeColumn } from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { usePageSize } from "../../config/usePageSize";
import { useGridDefaultFromDays } from "../../config/useGridDefaultFromDays";
import { defaultGridDateRange } from "../../lib/dateRangeDefaults";
import { applyBroadcastListFilters } from "./broadcastListFilters";
import type { Enmax_autocadbroadcasts } from "../../generated/models/Enmax_autocadbroadcastsModel";
import { useBroadcasts } from "./useBroadcasts";
import { BroadcastEditorDrawer } from "./BroadcastEditorDrawer";
import { computeDisplayStatus, STATUS_COLOR, SEVERITY_LABEL, audienceLabels } from "./broadcastUtils";
import { broadcastSeverityIntent } from "../home/homeUtils";

const FADE_UP = { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } };

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  header: {
    paddingLeft: tokens.spacingHorizontalL, borderLeftWidth: "4px", borderLeftStyle: "solid",
    borderLeftColor: tokens.colorBrandForeground1, animationName: FADE_UP, animationDuration: "200ms", animationFillMode: "both",
  },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXS, display: "block" },
  toolbar: { display: "flex" },
  content: { animationName: FADE_UP, animationDuration: "150ms", animationFillMode: "both" },
});

const SEV_COLOR: Record<string, "informative" | "warning" | "danger"> = {
  info: "informative", warning: "warning", error: "danger", success: "informative",
};

function initialFilters(fromDays?: number) {
  const { from, to } = defaultGridDateRange(new Date(), fromDays);
  return { number: "", from, to };
}

export function BroadcastsPage() {
  const styles = useStyles();
  const pageSize = usePageSize();
  const fromDays = useGridDefaultFromDays();
  const broadcastsQ = useBroadcasts();
  const [editorOpen, setEditorOpen] = useState(false);
  const [selected, setSelected] = useState<Enmax_autocadbroadcasts | null>(null);

  const [filterDraft, setFilterDraft] = useState(() => initialFilters(fromDays));
  const [appliedFilters, setAppliedFilters] = useState(() => initialFilters(fromDays));

  const rows = broadcastsQ.data ?? [];

  const filteredRows = useMemo(
    () => applyBroadcastListFilters(rows, appliedFilters),
    [rows, appliedFilters],
  );

  const columns = useMemo((): ColumnDef<Enmax_autocadbroadcasts>[] => [
    {
      id: "status", header: "Status", accessor: (r) => computeDisplayStatus(r), sortable: true, width: 110,
      cell: (r) => { const s = computeDisplayStatus(r); return <Badge appearance="tint" color={STATUS_COLOR[s]} shape="rounded">{s}</Badge>; },
    },
    { id: "title", header: "Title", accessor: (r) => r.enmax_acdntitle ?? "", sortable: true },
    {
      id: "severity", header: "Severity", accessor: (r) => SEVERITY_LABEL[r.enmax_acdnseverity ?? 1] ?? "", width: 110,
      cell: (r) => <Badge appearance="tint" color={SEV_COLOR[broadcastSeverityIntent(r.enmax_acdnseverity)]} shape="rounded">{SEVERITY_LABEL[r.enmax_acdnseverity ?? 1]}</Badge>,
    },
    { id: "audience", header: "Audience", accessor: (r) => audienceLabels(r.enmax_acdnaudience) },
    dateTimeColumn<Enmax_autocadbroadcasts>({
      id: "startsat",
      header: "Starts",
      accessor: r => r.enmax_acdnstartsat,
      width: 160,
    }),
    dateTimeColumn<Enmax_autocadbroadcasts>({
      id: "expiresat",
      header: "Expires",
      accessor: r => r.enmax_acdnexpiresat,
      width: 160,
    }),
    {
      id: "pinned", header: "Pinned", accessor: (r) => (r.enmax_acdnpinned ? "Yes" : "No"), width: 90, visibleByDefault: false,
      cell: (r) => (r.enmax_acdnpinned ? <Badge appearance="tint" color="brand">Pinned</Badge> : <>—</>),
    },
  ], []);

  const fetcher = useCallback(
    async (params: GridFetchParams): Promise<{ rows: Enmax_autocadbroadcasts[]; totalCount: number }> =>
      clientPage(filteredRows, params, { searchText: (r) => [r.enmax_acdntitle ?? "", r.enmax_acdnbody ?? ""] }),
    [filteredRows],
  );
  const queryKey = useMemo(
    () => ["broadcast-grid", appliedFilters, filteredRows.map((r) => r.enmax_autocadbroadcastid + (r.enmax_acdnstatus ?? "")).join(",")],
    [appliedFilters, filteredRows],
  );

  function handleQuery() {
    setAppliedFilters({ number: filterDraft.number, from: filterDraft.from, to: filterDraft.to });
  }

  function handleClear() {
    const cleared = initialFilters(fromDays);
    setFilterDraft(cleared);
    setAppliedFilters(cleared);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Title2 as="h1">Broadcasts</Title2>
        <Text size={300} className={styles.subtitle}>
          Author and manage system broadcasts shown on Home and in the notification bell.
        </Text>
      </div>

      <div className={styles.toolbar}>
        <Button appearance="primary" icon={<Add20Regular />} onClick={() => { setSelected(null); setEditorOpen(true); }}>
          New broadcast
        </Button>
      </div>

      {broadcastsQ.isPending && <Spinner label="Loading…" />}
      {broadcastsQ.isError && (
        <MessageBar intent="error"><MessageBarBody>Failed to load broadcasts. Please refresh.</MessageBarBody></MessageBar>
      )}
      {broadcastsQ.data && (
        <div className={styles.content}>
          <GridQueryFilterBar
            numberLabel="Title"
            numberPlaceholder="Search title or body…"
            draft={{ number: filterDraft.number, from: filterDraft.from, to: filterDraft.to }}
            onDraftChange={(patch) => setFilterDraft((prev) => ({ ...prev, ...patch }))}
            onQuery={handleQuery}
            onClear={handleClear}
          />
          <EnmaxDataGrid
            queryKey={queryKey}
            fetcher={fetcher}
            columns={columns}
            rowKey={(r) => r.enmax_autocadbroadcastid}
            onRowClick={(b) => { setSelected(b); setEditorOpen(true); }}
            enableColumnVisibility
            enableQuickSearch={false}
            initialPageSize={pageSize}
            defaultSort={{ column: "startsat", direction: "desc" }}
            emptyMessage="No broadcasts yet. Create one to notify users."
            errorMessage="Failed to load broadcasts."
          />
        </div>
      )}

      <BroadcastEditorDrawer broadcast={selected} open={editorOpen} onClose={() => setEditorOpen(false)} />
    </div>
  );
}
