import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Text,
  Title2,
  Toast,
  ToastTitle,
  Toaster,
  makeStyles,
  tokens,
  useToastController,
} from "@fluentui/react-components";
import { useQueryClient } from "@tanstack/react-query";
import { AddRegular, EditRegular, PowerRegular } from "@fluentui/react-icons";
import { REF_TABLES, NUMBER_SEQUENCES_IDX } from "./tableConfig";
import { makeRefTableFetcher, makeJunctionFetcher, useSaveRefRow, useDeactivateRefRow, type RefRow, type RefRowMutation } from "./useRefTableData";
import { useRefTableSummary, useNextSortOrder } from "./useNextSortOrder";
import { useCompositionLookups } from "../approvals/hooks/useCompositionLookups";
import { RefRowPanel } from "./RefRowPanel";
import { NumberSequencesGrid } from "./NumberSequencesGrid";
import { EnmaxDataGrid } from "../../components/DataGrid";
import type { ColumnDef, RowAction } from "../../components/DataGrid";

const TOASTER_ID = "refdata-toaster";

const REF_COLUMNS: ColumnDef<RefRow>[] = [
  {
    id: "code", header: "Code",
    accessor: r => r.code,
    sortable: true,
    cell: r => <Badge appearance="filled" color="informative" style={{ fontFamily: "monospace" }}>{r.code}</Badge>,
  },
  { id: "displayName", header: "Display Name", accessor: r => r.displayName, sortable: true },
  { id: "description", header: "Description",  accessor: r => r.description, cell: r => <Text size={200}>{r.description}</Text> },
  { id: "sortOrder",   header: "Sort Order",   accessor: r => r.sortOrder,   sortable: true },
  {
    id: "statecode", header: "Status",
    accessor: r => r.statecode,
    sortable: true,
    cell: r => (
      <Badge appearance="filled" color={r.statecode === 0 ? "success" : "subtle"}>
        {r.statecode === 0 ? "Active" : "Inactive"}
      </Badge>
    ),
  },
];

// Junction tables are combination records (read-only here) — show the resolved
// code pair, the full names, and status.
const JUNCTION_COLUMNS: ColumnDef<RefRow>[] = [
  {
    id: "code", header: "Combination",
    accessor: r => r.code,
    sortable: true,
    cell: r => <Badge appearance="filled" color="informative" style={{ fontFamily: "monospace" }}>{r.code}</Badge>,
  },
  { id: "displayName", header: "Detail", accessor: r => r.displayName, sortable: true, cell: r => <Text size={200}>{r.displayName}</Text> },
  {
    id: "statecode", header: "Status",
    accessor: r => r.statecode,
    sortable: true,
    cell: r => (
      <Badge appearance="filled" color={r.statecode === 0 ? "success" : "subtle"}>
        {r.statecode === 0 ? "Active" : "Inactive"}
      </Badge>
    ),
  },
];

const useStyles = makeStyles({
  root:    { display: "flex", height: "100%", gap: 0 },
  rail:    {
    width:       "240px",
    flexShrink:  0,
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    overflowY:   "auto",
    paddingTop:  tokens.spacingVerticalS,
  },
  railItem: {
    display:    "block",
    width:      "100%",
    padding:    `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    background: "transparent",
    border:     "none",
    textAlign:  "left",
    cursor:     "pointer",
    color:      tokens.colorNeutralForeground2,
    fontFamily: tokens.fontFamilyBase,
    fontSize:   tokens.fontSizeBase300,
    ":hover":   { background: tokens.colorSubtleBackgroundHover, color: tokens.colorNeutralForeground1 },
  },
  railItemActive: {
    background:  tokens.colorNeutralBackground1Selected,
    color:       tokens.colorNeutralForeground1,
    fontWeight:  tokens.fontWeightSemibold,
  },
  content: { flex: 1, display: "flex", flexDirection: "column", padding: tokens.spacingHorizontalM, overflow: "hidden" },
  toolbar: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, marginBottom: tokens.spacingVerticalM },
  spacer:  { flex: 1 },
});

export function ReferenceDataPage() {
  const styles = useStyles();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [panelOpen, setPanelOpen]     = useState(false);
  const [editing, setEditing]         = useState<RefRow | null>(null);
  const { dispatchToast } = useToastController(TOASTER_ID);

  const config = REF_TABLES[selectedIdx];
  const isNumberSequences = selectedIdx === NUMBER_SEQUENCES_IDX;
  const isJunction = !!config.isJunction;

  const queryClient    = useQueryClient();
  const saveMutation       = useSaveRefRow(config);
  const deactivateMutation = useDeactivateRefRow(config);
  const summary        = useRefTableSummary(config);
  const nextSort       = useNextSortOrder(config);
  const { data: compMaps } = useCompositionLookups();

  const refFetcher = useMemo(
    () => (isJunction ? makeJunctionFetcher(config, compMaps) : makeRefTableFetcher(config)),
    [config, isJunction, compMaps],
  );

  function openAdd()             { setEditing(null); setPanelOpen(true); }
  function openEdit(row: RefRow) { setEditing(row);  setPanelOpen(true); }
  function closePanel()          { setPanelOpen(false); setEditing(null); }

  function invalidateRefSideEffects() {
    void queryClient.invalidateQueries({ queryKey: ["ref-summary", config.entityName] });
    void queryClient.invalidateQueries({ queryKey: ["ref-next-sort", config.entityName] });
  }

  async function handleSave(row: RefRowMutation) {
    try {
      await saveMutation.mutateAsync(row);
      invalidateRefSideEffects();
      dispatchToast(<Toast><ToastTitle>Row saved.</ToastTitle></Toast>, { intent: "success" });
      closePanel();
    } catch {
      dispatchToast(<Toast><ToastTitle>Save failed — check for duplicate Code.</ToastTitle></Toast>, { intent: "error" });
    }
  }

  async function handleDeactivate(row: RefRow) {
    try {
      await deactivateMutation.mutateAsync({ id: row.id, activate: row.statecode !== 0 });
      invalidateRefSideEffects();
      const action = row.statecode !== 0 ? "Activated" : "Deactivated";
      dispatchToast(<Toast><ToastTitle>{action}.</ToastTitle></Toast>, { intent: "success" });
    } catch {
      dispatchToast(<Toast><ToastTitle>Status update failed.</ToastTitle></Toast>, { intent: "error" });
    }
  }

  const rowActions: RowAction<RefRow>[] = [
    { label: "Edit",       icon: <EditRegular />,  onClick: openEdit },
    { label: "Deactivate", icon: <PowerRegular />, onClick: row => void handleDeactivate(row), hidden: r => r.statecode !== 0, disabled: () => deactivateMutation.isPending },
    { label: "Activate",   icon: <PowerRegular />, onClick: row => void handleDeactivate(row), hidden: r => r.statecode === 0, disabled: () => deactivateMutation.isPending },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM }}>
      <Toaster toasterId={TOASTER_ID} />
      <Title2 as="h1">Reference Data</Title2>

      <div className={styles.root}>
        {/* Left rail */}
        <nav className={styles.rail} aria-label="Reference tables">
          {REF_TABLES.map((t, i) => (
            <button
              key={t.entityName}
              className={`${styles.railItem} ${i === selectedIdx ? styles.railItemActive : ""}`}
              onClick={() => setSelectedIdx(i)}
              aria-pressed={i === selectedIdx}
            >
              {t.displayName}
            </button>
          ))}
        </nav>

        {/* Content area */}
        <div className={styles.content}>
          <div className={styles.toolbar}>
            <Text weight="semibold" size={400}>{config.displayName}</Text>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {summary.data ? `${summary.data.total} codes · ${summary.data.active} active · ${summary.data.inactive} inactive` : ""}
            </Text>
            <div className={styles.spacer} />
            {!isNumberSequences && !isJunction && (
              <Button icon={<AddRegular />} appearance="primary" onClick={openAdd}>Add Row</Button>
            )}
          </div>

          {isNumberSequences
            ? <NumberSequencesGrid />
            : (
              <EnmaxDataGrid
                key={config.entityName}
                queryKey={["ref-table", config.entityName, isJunction ? (compMaps?.bizMap.size ?? 0) : 0]}
                fetcher={refFetcher}
                columns={isJunction ? JUNCTION_COLUMNS : REF_COLUMNS}
                rowKey={r => r.id}
                rowActions={isJunction ? undefined : rowActions}
                enableColumnVisibility
                defaultSort={{ column: isJunction ? "code" : "sortOrder", direction: "asc" }}
                quickSearchPlaceholder="Search…"
                emptyMessage={isJunction ? "No combinations defined." : "No rows. Click Add Row to create one."}
                errorMessage="Failed to load table."
              />
            )
          }
        </div>
      </div>

      <RefRowPanel
        open={panelOpen}
        editing={editing}
        nextSortOrder={nextSort.data ?? 10}
        onClose={closePanel}
        onSave={row => void handleSave(row)}
        isSaving={saveMutation.isPending}
      />
    </div>
  );
}
