import { useState } from "react";
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
import { AddRegular, EditRegular } from "@fluentui/react-icons";
import {
  fetchAppConfigRows,
  useUpsertConfigRow,
  VALUE_TYPE_LABELS,
  type ConfigRow,
  type ConfigRowMutation,
} from "./useAppConfigAdmin";
import { AppConfigRowPanel } from "./AppConfigRowPanel";
import { EnmaxDataGrid } from "../../components/DataGrid";
import type { ColumnDef, RowAction } from "../../components/DataGrid";

const TOASTER_ID = "app-config-toaster";

const useStyles = makeStyles({
  root:    { display: "flex", flexDirection: "column", height: "100%", gap: tokens.spacingVerticalM },
  toolbar: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
  spacer:  { flex: 1 },
  grid:    { flex: 1, overflow: "hidden" },
});

const CONFIG_COLUMNS: ColumnDef<ConfigRow>[] = [
  {
    id: "key", header: "Key",
    accessor: r => r.key,
    sortable: true,
    filterable: true, filterType: "text",
    cell: r => <Text weight="semibold">{r.key}</Text>,
  },
  {
    id: "value", header: "Value",
    accessor: r => r.value,
    cell: r => <Text size={200} style={{ fontFamily: "monospace" }}>{r.value.length > 120 ? `${r.value.slice(0, 120)}…` : r.value}</Text>,
  },
  {
    id: "valueType", header: "Type",
    accessor: r => VALUE_TYPE_LABELS[r.valueType] ?? String(r.valueType),
    sortable: true,
    width: 120,
    cell: r => <Badge appearance="tint" color="informative">{VALUE_TYPE_LABELS[r.valueType] ?? String(r.valueType)}</Badge>,
  },
];

export function AppConfigPage() {
  const styles = useStyles();
  const { dispatchToast } = useToastController(TOASTER_ID);
  const upsert = useUpsertConfigRow();

  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing]     = useState<ConfigRow | null>(null);

  function openAdd()                 { setEditing(null); setPanelOpen(true); }
  function openEdit(row: ConfigRow)  { setEditing(row);  setPanelOpen(true); }
  function closePanel()              { setPanelOpen(false); setEditing(null); }

  async function handleSave(row: ConfigRowMutation) {
    try {
      await upsert.mutateAsync(row);
      dispatchToast(<Toast><ToastTitle>"{row.key}" saved.</ToastTitle></Toast>, { intent: "success" });
      closePanel();
    } catch {
      dispatchToast(<Toast><ToastTitle>Save failed — check the key and value.</ToastTitle></Toast>, { intent: "error" });
    }
  }

  const rowActions: RowAction<ConfigRow>[] = [
    { label: "Edit", icon: <EditRegular />, onClick: openEdit },
  ];

  return (
    <div className={styles.root}>
      <Toaster toasterId={TOASTER_ID} />

      <div className={styles.toolbar}>
        <Title2 as="h1">App Configuration</Title2>
        <div className={styles.spacer} />
        <Button icon={<AddRegular />} appearance="primary" onClick={openAdd}>Add Configuration</Button>
      </div>

      <div className={styles.grid}>
        <EnmaxDataGrid
          queryKey={["app-config-admin-grid"]}
          fetcher={fetchAppConfigRows}
          columns={CONFIG_COLUMNS}
          rowKey={r => r.id}
          rowActions={rowActions}
          enableColumnVisibility
          defaultSort={{ column: "key", direction: "asc" }}
          quickSearchPlaceholder="Search by key or value…"
          emptyMessage="No configuration rows. Click Add Configuration to create one."
          errorMessage="Failed to load configuration rows."
        />
      </div>

      <AppConfigRowPanel
        key={`${panelOpen}-${editing?.id ?? "new"}`}
        open={panelOpen}
        editing={editing}
        onClose={closePanel}
        onSave={row => void handleSave(row)}
        isSaving={upsert.isPending}
      />
    </div>
  );
}
