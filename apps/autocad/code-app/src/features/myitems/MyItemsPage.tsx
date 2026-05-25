import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Link,
  Switch,
  Tab,
  TabList,
  Text,
  Title2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { fetchMyReservationRows, type MyReservation } from "./useMyReservations";
import { fetchMyCheckoutRows, type MyCheckout } from "./useMyCheckouts";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { useCompositionLookups, type CompositionMaps } from "../approvals/hooks/useCompositionLookups";
import { formatComposition } from "../approvals/compositionUtils";
import { DrawingDetailPanel } from "../search/DrawingDetailPanel";
import { EnmaxDataGrid } from "../../components/DataGrid";
import type { ColumnDef, GridFetchParams } from "../../components/DataGrid";
import type { DrawingRow } from "../search/useSearchDrawings";

type TabValue = "reservations" | "checkouts";

const STATUS_COLORS: Record<number, "success" | "warning" | "danger" | "informative" | undefined> = {
  1: "warning",
  2: "success",
  3: "danger",
  4: undefined,
};

const useStyles = makeStyles({
  root:    { display: "flex", flexDirection: "column", height: "100%", gap: tokens.spacingVerticalM },
  toolbar: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, flexWrap: "wrap" },
  spacer:  { flex: 1 },
  grid:    { flex: "1 0 auto", minHeight: "500px" },
});

// Resolve each composition lookup GUID to its short code and render the canonical
// reservation string, e.g. "GW-GN-00-AES-AAA-AC-0001–0010" (?-fallback while maps load).
function compositionFor(r: MyReservation, maps?: CompositionMaps): string {
  return formatComposition({
    businessCode: maps?.bizMap.get(r.businessId),
    assetCode:    maps?.assetMap.get(r.assetId),
    unitCode:     maps?.unitMap.get(r.unitId),
    domainCode:   maps?.domainMap.get(r.domainId),
    systemCode:   maps?.sysMap.get(r.systemId),
    kindCode:     maps?.kindMap.get(r.kindId),
    enmax_acdnissuednumbers: r.issuedNumbers,
  });
}

const CHK_COLUMNS: ColumnDef<MyCheckout>[] = [
  {
    id: "drawingNumber", header: "ENMAX Number",
    accessor: r => r.drawingNumber,
    sortable: true,
    cell: r => <Text weight="semibold">{r.drawingNumber}</Text>,
  },
  { id: "drawingTitle",       header: "Title",          accessor: r => r.drawingTitle,       sortable: true },
  {
    id: "checkedOutOn", header: "Checked Out On",
    accessor: r => r.checkedOutOn,
    sortable: true,
    cell: r => <>{r.checkedOutOn ? new Date(r.checkedOutOn).toLocaleDateString() : ""}</>,
  },
  { id: "daysOut",            header: "Days Out",        accessor: r => r.daysOut,            sortable: true, width: 90 },
  { id: "reminderStageLabel", header: "Reminder Stage",  accessor: r => r.reminderStageLabel, visibleByDefault: false },
  {
    id: "status", header: "Status",
    accessor: r => r.status,
    sortable: true,
    cell: r => (
      <Badge appearance="tint" color={r.status === 1 ? "warning" : "informative"}>
        {r.statusLabel}
      </Badge>
    ),
  },
  {
    id: "drawingLibraryUrl", header: "Library",
    accessor: r => r.drawingLibraryUrl,
    cell: r => r.drawingLibraryUrl
      ? <Link href={r.drawingLibraryUrl} target="_blank" rel="noopener noreferrer">Open</Link>
      : null,
  },
];

function makeDrawingRow(c: MyCheckout): DrawingRow {
  return {
    id: c.drawingId,
    enmax_acdnnumber:          c.drawingNumber,
    enmax_acdntitle:           c.drawingTitle,
    enmax_acdncurrentrevision: "",
    enmax_acdnrevisiondate:    "",
    enmax_acdnstate:           (c.status === 1 || c.status === 2) ? 2 : 4,
    enmax_acdnsheetcount:      0,
    enmax_acdnsplibraryurl:    c.drawingLibraryUrl,
    _enmax_acdnbusiness_value:   "",
    _enmax_acdnasset_value:      "",
    _enmax_acdnunit_value:       "",
    _enmax_acdndomain_value:     "",
    _enmax_acdnsystem_value:     "",
    _enmax_acdnkind_value:       "",
    _enmax_acdnrecordtype_value: "",
    _enmax_acdnrecordphase_value:"",
    _enmax_acdnvendor_value:     "",
    _createdby_value:            "",
    businessDisplay: "", assetDisplay: "", unitDisplay: "",
    domainDisplay: "", systemDisplay: "", kindDisplay: "",
    recordTypeDisplay: "", recordPhaseDisplay: "",
    vendorDisplay: "", requesterDisplay: "",
  };
}

export function MyItemsPage() {
  const styles   = useStyles();
  const navigate = useNavigate();
  const { data: user }    = useCurrentUser();
  const userId            = user?.id ?? "";
  const { data: compMaps } = useCompositionLookups();

  const RES_COLUMNS = useMemo<ColumnDef<MyReservation>[]>(() => [
    {
      id: "reservationNumber", header: "Reservation ID",
      accessor: r => r.reservationNumber,
      sortable: true,
      cell: r => <Text weight="semibold">{r.reservationNumber}</Text>,
    },
    {
      id: "status", header: "Status",
      accessor: r => r.status,
      sortable: true,
      cell: r => <Badge appearance="tint" color={STATUS_COLORS[r.status]}>{r.statusLabel}</Badge>,
    },
    {
      id: "composition", header: "Composition",
      accessor: r => compositionFor(r, compMaps),
      cell: r => <Text size={200} style={{ fontFamily: "monospace" }}>{compositionFor(r, compMaps)}</Text>,
    },
    { id: "drawingCount",    header: "Count",               accessor: r => r.drawingCount,    sortable: true, width: 80 },
    {
      id: "createdOn", header: "Submitted",
      accessor: r => r.createdOn,
      sortable: true,
      cell: r => <>{r.createdOn ? new Date(r.createdOn).toLocaleDateString() : ""}</>,
    },
    {
      id: "approvedOn", header: "Approved/Declined On",
      accessor: r => r.approvedOn,
      sortable: true, visibleByDefault: false,
      cell: r => <>{r.approvedOn ? new Date(r.approvedOn).toLocaleDateString() : ""}</>,
    },
    { id: "approverDisplay", header: "Approver",        accessor: r => r.approverDisplay, visibleByDefault: false },
    { id: "issuedNumbers",   header: "Issued Numbers",  accessor: r => r.issuedNumbers,   visibleByDefault: false },
  ], [compMaps]);

  const [activeTab,     setActiveTab]     = useState<TabValue>("reservations");
  const [showFinalised, setShowFinalised] = useState(false);
  const [panelDrawing,  setPanelDrawing]  = useState<DrawingRow | null>(null);

  const resFetcher = useCallback(
    (params: GridFetchParams) => {
      if (!userId) return Promise.resolve({ rows: [] as MyReservation[], totalCount: 0 });
      return fetchMyReservationRows(userId, showFinalised, params);
    },
    [userId, showFinalised],
  );

  const chkFetcher = useCallback(
    (params: GridFetchParams) => {
      if (!userId) return Promise.resolve({ rows: [] as MyCheckout[], totalCount: 0 });
      return fetchMyCheckoutRows(userId, showFinalised, params);
    },
    [userId, showFinalised],
  );

  return (
    <div className={styles.root}>

      <div className={styles.toolbar}>
        <Title2 as="h1">My Items</Title2>
        <div className={styles.spacer} />
        <Switch
          label="Show finalised"
          checked={showFinalised}
          onChange={(_, d) => setShowFinalised(d.checked)}
        />
      </div>

      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, d) => setActiveTab(d.value as TabValue)}
      >
        <Tab value="reservations">My Drawing Reservations</Tab>
        <Tab value="checkouts">My Checked-Out Drawings</Tab>
      </TabList>

      {activeTab === "reservations" && (
        <div className={styles.grid}>
          <EnmaxDataGrid
            key={`res-${showFinalised}`}
            queryKey={["my-reservations", userId, showFinalised]}
            fetcher={resFetcher}
            columns={RES_COLUMNS}
            rowKey={r => r.id}
            onRowClick={r => navigate(`/reservations/${r.id}`)}
            enableColumnVisibility
            defaultSort={{ column: "createdOn", direction: "desc" }}
            quickSearchPlaceholder="Search reservations…"
            emptyMessage="No reservations found."
            errorMessage="Failed to load reservations."
          />
        </div>
      )}

      {activeTab === "checkouts" && (
        <div className={styles.grid}>
          <EnmaxDataGrid
            key={`chk-${showFinalised}`}
            queryKey={["my-checkouts", userId, showFinalised]}
            fetcher={chkFetcher}
            columns={CHK_COLUMNS}
            rowKey={r => r.checkoutId}
            onRowClick={c => setPanelDrawing(makeDrawingRow(c))}
            enableColumnVisibility
            defaultSort={{ column: "checkedOutOn", direction: "desc" }}
            quickSearchPlaceholder="Search checked-out drawings…"
            emptyMessage="No checked-out drawings."
            errorMessage="Failed to load checkouts."
          />
        </div>
      )}

      <DrawingDetailPanel drawing={panelDrawing} onClose={() => setPanelDrawing(null)} />
    </div>
  );
}
