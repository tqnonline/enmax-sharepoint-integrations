import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Link,
  Tab,
  TabList,
  Text,
  Title2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { EnmaxDataGrid } from "../../components/DataGrid";
import type { ColumnDef } from "../../components/DataGrid";
import { useCompositionLookups } from "../approvals/hooks/useCompositionLookups";
import { DrawingDetailPanel } from "./DrawingDetailPanel";
import { fetchSearchDrawings, DRAWING_STATE_LABELS, type DrawingRow } from "./useSearchDrawings";
import { fetchSearchReservations, type ReservationRow } from "./useUnifiedSearch";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", gap: tokens.spacingVerticalM },
  stateBadge: { minWidth: "80px" },
});

const STATE_COLORS: Record<number, "success" | "warning" | "danger" | "informative" | undefined> = {
  1: "success",
  2: "informative",
  3: "warning",
  4: "warning",
  5: undefined,
};

type BadgeColor = "success" | "informative" | "subtle";
const RESERVATION_STATUS: Record<number, { label: string; color: BadgeColor }> = {
  1: { label: "Pending",  color: "informative" },
  2: { label: "Approved", color: "success" },
  3: { label: "Declined", color: "subtle" },
};

export function SearchPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState<"drawings" | "reservations">("drawings");
  const [selectedDrawing, setSelectedDrawing] = useState<DrawingRow | null>(null);
  const { data: compMaps } = useCompositionLookups();

  const drawingColumns = useMemo((): ColumnDef<DrawingRow>[] => {
    const toOpts = (m: Map<string, string>) =>
      Array.from(m.entries()).map(([value, label]) => ({ value, label }));
    return [
      {
        id: "enmax_acdnnumber",
        header: "ENMAX Number",
        accessor: r => r.enmax_acdnnumber,
        sortable: true,
        filterable: true,
        filterType: "text",
        visibleByDefault: true,
        width: 160,
        cell: r => <Text weight="semibold">{r.enmax_acdnnumber}</Text>,
      },
      {
        id: "enmax_acdntitle",
        header: "Title",
        accessor: r => r.enmax_acdntitle,
        sortable: true,
        filterable: true,
        filterType: "text",
        visibleByDefault: true,
        cell: r => /^https?:\/\//i.test(r.enmax_acdnsplibraryurl ?? "")
          ? <Link href={r.enmax_acdnsplibraryurl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{r.enmax_acdntitle}</Link>
          : <span>{r.enmax_acdntitle}</span>,
      },
      {
        id: "business",
        header: "Business",
        accessor: r => r.businessDisplay,
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: toOpts(compMaps?.bizMap ?? new Map()),
        visibleByDefault: true,
        width: 100,
      },
      {
        id: "asset",
        header: "Asset",
        accessor: r => r.assetDisplay,
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: toOpts(compMaps?.assetMap ?? new Map()),
        visibleByDefault: true,
        width: 100,
      },
      {
        id: "unit",
        header: "Unit",
        accessor: r => r.unitDisplay,
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: toOpts(compMaps?.unitMap ?? new Map()),
        visibleByDefault: true,
        width: 80,
      },
      {
        id: "domain",
        header: "Domain",
        accessor: r => r.domainDisplay,
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: toOpts(compMaps?.domainMap ?? new Map()),
        visibleByDefault: true,
        width: 100,
      },
      {
        id: "system",
        header: "System",
        accessor: r => r.systemDisplay,
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: toOpts(compMaps?.sysMap ?? new Map()),
        visibleByDefault: true,
        width: 100,
      },
      {
        id: "kind",
        header: "Kind",
        accessor: r => r.kindDisplay,
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: toOpts(compMaps?.kindMap ?? new Map()),
        visibleByDefault: true,
        width: 80,
      },
      {
        id: "recordType",
        header: "Record Type",
        accessor: r => r.recordTypeDisplay,
        sortable: true,
        filterable: true,
        filterType: "text",
        visibleByDefault: false,
        width: 120,
      },
      {
        id: "recordPhase",
        header: "Record Phase",
        accessor: r => r.recordPhaseDisplay,
        sortable: true,
        filterable: true,
        filterType: "text",
        visibleByDefault: false,
        width: 120,
      },
      {
        id: "vendor",
        header: "Vendor",
        accessor: r => r.vendorDisplay,
        sortable: true,
        filterable: true,
        filterType: "text",
        visibleByDefault: false,
        width: 120,
      },
      {
        id: "enmax_acdncurrentrevision",
        header: "Current Revision",
        accessor: r => r.enmax_acdncurrentrevision,
        sortable: true,
        filterable: true,
        filterType: "text",
        visibleByDefault: true,
        width: 120,
      },
      {
        id: "enmax_acdnrevisiondate",
        header: "Revision Date",
        accessor: r => r.enmax_acdnrevisiondate,
        sortable: true,
        filterable: true,
        filterType: "date",
        visibleByDefault: true,
        width: 130,
        cell: r => <span>{r.enmax_acdnrevisiondate ? new Date(r.enmax_acdnrevisiondate).toLocaleDateString() : ""}</span>,
        exportFormatter: v => v ? new Date(String(v)).toLocaleDateString() : "",
      },
      {
        id: "enmax_acdnstate",
        header: "State",
        accessor: r => DRAWING_STATE_LABELS[r.enmax_acdnstate] ?? String(r.enmax_acdnstate),
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: Object.entries(DRAWING_STATE_LABELS).map(([k, v]) => ({ value: k, label: v })),
        visibleByDefault: true,
        width: 140,
        cell: r => (
          <Badge appearance="tint" color={STATE_COLORS[r.enmax_acdnstate]}>
            {DRAWING_STATE_LABELS[r.enmax_acdnstate] ?? String(r.enmax_acdnstate)}
          </Badge>
        ),
        exportFormatter: v => String(v),
      },
      {
        id: "requester",
        header: "Requester",
        accessor: r => r.requesterDisplay,
        sortable: true,
        filterable: true,
        filterType: "text",
        visibleByDefault: true,
        width: 140,
      },
      {
        id: "enmax_acdnsheetcount",
        header: "Sheets",
        accessor: r => r.enmax_acdnsheetcount,
        sortable: true,
        filterable: false,
        visibleByDefault: false,
        width: 80,
      },
    ];
  }, [compMaps]);

  const reservationColumns = useMemo((): ColumnDef<ReservationRow>[] => [
    {
      id: "number",
      header: "Reservation #",
      accessor: r => r.number,
      sortable: true,
      filterable: true,
      filterType: "text",
      visibleByDefault: true,
      width: 160,
      cell: r => <Text weight="semibold">{r.number}</Text>,
    },
    {
      id: "status",
      header: "Status",
      accessor: r => RESERVATION_STATUS[r.status]?.label ?? String(r.status),
      sortable: true,
      filterable: true,
      filterType: "select",
      filterOptions: Object.entries(RESERVATION_STATUS).map(([k, v]) => ({ value: k, label: v.label })),
      visibleByDefault: true,
      width: 120,
      cell: r => {
        const s = RESERVATION_STATUS[r.status] ?? RESERVATION_STATUS[1];
        return <Badge appearance="tint" color={s.color}>{s.label}</Badge>;
      },
    },
    {
      id: "reason",
      header: "Reason",
      accessor: r => r.reason,
      sortable: false,
      filterable: true,
      filterType: "text",
      visibleByDefault: true,
    },
    {
      id: "requesterName",
      header: "Requester",
      accessor: r => r.requesterName,
      sortable: false,
      filterable: false,
      visibleByDefault: true,
      width: 160,
    },
    {
      id: "createdon",
      header: "Date",
      accessor: r => r.createdon,
      sortable: true,
      filterable: false,
      visibleByDefault: true,
      width: 130,
      cell: r => <span>{r.createdon ? new Date(r.createdon).toLocaleDateString() : ""}</span>,
    },
  ], []);

  return (
    <div className={styles.root}>
      <Title2 as="h1">Search</Title2>

      <TabList
        selectedValue={selectedTab}
        onTabSelect={(_, d) => setSelectedTab(d.value as "drawings" | "reservations")}
      >
        <Tab value="drawings">Drawings</Tab>
        <Tab value="reservations">Reservations</Tab>
      </TabList>

      {selectedTab === "drawings" && (
        <>
          <EnmaxDataGrid
            queryKey={["drawings-search"]}
            fetcher={fetchSearchDrawings}
            columns={drawingColumns}
            rowKey={r => r.id}
            defaultSort={{ column: "enmax_acdnnumber", direction: "asc" }}
            enableExport
            enableColumnVisibility
            requireSearch
            searchPrompt="Search by ENMAX Number or title to find drawings."
            quickSearchPlaceholder="Search by ENMAX Number or title…"
            emptyMessage="No drawings found. Try adjusting your search or filters."
            onRowClick={setSelectedDrawing}
          />

          <DrawingDetailPanel
            drawing={selectedDrawing}
            onClose={() => setSelectedDrawing(null)}
          />
        </>
      )}

      {selectedTab === "reservations" && (
        <EnmaxDataGrid
          queryKey={["reservations-search"]}
          fetcher={fetchSearchReservations}
          columns={reservationColumns}
          rowKey={r => r.id}
          defaultSort={{ column: "number", direction: "asc" }}
          requireSearch
          searchPrompt="Search by reservation # or reason to find reservations."
          quickSearchPlaceholder="Search by reservation # or reason…"
          emptyMessage="No reservations found. Try adjusting your search."
          onRowClick={r => navigate(`/reservations/${r.id}`)}
        />
      )}
    </div>
  );
}
