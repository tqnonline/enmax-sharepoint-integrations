import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Title2,
  Spinner,
  MessageBar,
  MessageBarBody,
  Input,
  Text,
  Badge,
  Button,
  CounterBadge,
  TabList,
  Tab,
  tokens,
  makeStyles,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  type TableColumnDefinition,
  createTableColumn,
  TableCellLayout,
} from "@fluentui/react-components";
import { ChevronLeft16Regular, ChevronRight16Regular } from "@fluentui/react-icons";
import { useCurrentUser } from "../auth/useCurrentUser";
import { useMyReservations } from "../features/approvals/hooks/useMyReservations";
import type { PendingReservation } from "../features/approvals/hooks/usePendingReservations";
import { formatComposition } from "../features/approvals/compositionUtils";
import { usePageSize } from "../config/usePageSize";
import { useMyCheckedOutDrawings, type CheckedOutDrawingRow } from "../features/checkout/hooks/useMyCheckedOutDrawings";
import { DrawingActionsPanel } from "../features/checkout/components/DrawingActionsPanel";

type BadgeColor = "success" | "warning" | "informative" | "subtle" | "danger";
const STATUS_MAP: Record<number, { label: string; color: BadgeColor }> = {
  1: { label: "Pending",  color: "informative" },
  2: { label: "Approved", color: "success" },
  3: { label: "Declined", color: "subtle" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const reservationColumns: TableColumnDefinition<PendingReservation>[] = [
  createTableColumn<PendingReservation>({
    columnId: "id",
    compare: (a, b) => a.enmax_acdnreservationnumber.localeCompare(b.enmax_acdnreservationnumber),
    renderHeaderCell: () => "Reservation",
    renderCell: (r) => (
      <TableCellLayout>
        <Text style={{ fontFamily: "monospace" }}>{r.enmax_acdnreservationnumber}</Text>
      </TableCellLayout>
    ),
  }),
  createTableColumn<PendingReservation>({
    columnId: "composition",
    renderHeaderCell: () => "Composition",
    renderCell: (r) => (
      <TableCellLayout>
        <Text style={{ fontFamily: "monospace", whiteSpace: "normal", wordBreak: "break-all" }}>{formatComposition(r)}</Text>
      </TableCellLayout>
    ),
  }),
  createTableColumn<PendingReservation>({
    columnId: "count",
    compare: (a, b) => a.enmax_acdndrawingcount - b.enmax_acdndrawingcount,
    renderHeaderCell: () => "Count",
    renderCell: (r) => <TableCellLayout>{r.enmax_acdndrawingcount}</TableCellLayout>,
  }),
  createTableColumn<PendingReservation>({
    columnId: "status",
    compare: (a, b) => a.enmax_acdnstatus - b.enmax_acdnstatus,
    renderHeaderCell: () => "Status",
    renderCell: (r) => {
      const s = STATUS_MAP[r.enmax_acdnstatus] ?? STATUS_MAP[1];
      return (
        <TableCellLayout>
          <div>
            <Badge appearance="filled" color={s.color} shape="rounded">{s.label}</Badge>
            {r.enmax_acdnstatus === 3 && r.enmax_acdndeclinereason && (
              <Text
                size={100}
                style={{
                  display: "block",
                  marginTop: "2px",
                  color: tokens.colorNeutralForeground3,
                  maxWidth: "200px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={r.enmax_acdndeclinereason}
              >
                {r.enmax_acdndeclinereason}
              </Text>
            )}
          </div>
        </TableCellLayout>
      );
    },
  }),
  createTableColumn<PendingReservation>({
    columnId: "submitted",
    compare: (a, b) => new Date(b.createdon).getTime() - new Date(a.createdon).getTime(),
    renderHeaderCell: () => "Submitted",
    renderCell: (r) => <TableCellLayout>{relativeTime(r.createdon)}</TableCellLayout>,
  }),
];

const FADE_UP = {
  from: { opacity: "0", transform: "translateY(8px)" },
  to:   { opacity: "1", transform: "translateY(0)" },
};

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  header: {
    paddingLeft: tokens.spacingHorizontalL,
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    borderLeftColor: tokens.colorBrandForeground1,
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationFillMode: "both",
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
    display: "block",
  },
  tabContent: {
    animationName: FADE_UP,
    animationDuration: "150ms",
    animationFillMode: "both",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
    flexWrap: "wrap",
  },
  searchInput: { maxWidth: "400px", minWidth: "200px", flex: "1 1 200px" },
  pagination: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalM,
    flexWrap: "wrap",
  },
});

type ActiveTab = "reservations" | "checked-out";

export default function MyItems() {
  const styles  = useStyles();
  const navigate = useNavigate();
  const pageSize = usePageSize();

  const [activeTab, setActiveTab]   = useState<ActiveTab>("reservations");
  const [search, setSearch]         = useState("");
  const [resPage, setResPage]       = useState(1);
  const [checkoutPage, setCheckoutPage] = useState(1);

  const { data: currentUser } = useCurrentUser();
  const query        = useMyReservations(currentUser?.id);
  const checkoutQuery = useMyCheckedOutDrawings();

  // Reservation number map for the checkout tab
  const reservationNumberMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of query.data ?? []) {
      map.set(r.enmax_acdnreservationid, r.enmax_acdnreservationnumber);
    }
    return map;
  }, [query.data]);

  // Checkout columns defined here to capture navigate + reservationNumberMap
  const checkoutColumns = useMemo((): TableColumnDefinition<CheckedOutDrawingRow>[] => [
    createTableColumn<CheckedOutDrawingRow>({
      columnId: "reservation",
      renderHeaderCell: () => "Reservation",
      renderCell: ({ reservationId }) => (
        <TableCellLayout>
          <Text style={{ fontFamily: "monospace" }}>
            {reservationId ? (reservationNumberMap.get(reservationId) ?? reservationId.slice(0, 8)) : "—"}
          </Text>
        </TableCellLayout>
      ),
    }),
    createTableColumn<CheckedOutDrawingRow>({
      columnId: "number",
      renderHeaderCell: () => "Drawing",
      renderCell: ({ drawing }) => (
        <TableCellLayout>
          <Text style={{ fontFamily: "monospace" }}>{drawing.number ?? "—"}</Text>
        </TableCellLayout>
      ),
    }),
    createTableColumn<CheckedOutDrawingRow>({
      columnId: "revision",
      renderHeaderCell: () => "Current Rev",
      renderCell: ({ drawing }) => (
        <TableCellLayout>{drawing.currentRevision ?? "—"}</TableCellLayout>
      ),
    }),
    createTableColumn<CheckedOutDrawingRow>({
      columnId: "action",
      renderHeaderCell: () => "Action",
      renderCell: (row) => (
        <TableCellLayout>
          <DrawingActionsPanel drawing={row.drawing} openCheckout={row.checkout} />
        </TableCellLayout>
      ),
    }),
  ], [reservationNumberMap]);

  // Reservations — filter + paginate
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q || !query.data) return query.data ?? [];
    return query.data.filter(
      (r) =>
        r.enmax_acdnreservationnumber?.toLowerCase().includes(q) ||
        r.enmax_acdnreason?.toLowerCase().includes(q) ||
        formatComposition(r).toLowerCase().includes(q),
    );
  }, [query.data, search]);

  const resTotalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const resSafePage   = Math.min(resPage, resTotalPages);
  const resPaged      = filtered.slice((resSafePage - 1) * pageSize, resSafePage * pageSize);

  // Checkouts — paginate
  const checkouts        = checkoutQuery.data ?? [];
  const coTotalPages     = Math.max(1, Math.ceil(checkouts.length / pageSize));
  const coSafePage       = Math.min(checkoutPage, coTotalPages);
  const coPaged          = checkouts.slice((coSafePage - 1) * pageSize, coSafePage * pageSize);

  const checkedOutCount = checkouts.length;

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.header}>
        <Title2 as="h1">My Items</Title2>
        <Text size={300} className={styles.subtitle}>
          Your reservations and checked-out drawings.
        </Text>
      </div>

      {/* Tab bar */}
      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, d) => setActiveTab(d.value as ActiveTab)}
      >
        <Tab value="reservations">
          My Reservations
          {query.data && (
            <CounterBadge
              count={query.data.length}
              size="small"
              appearance="ghost"
              style={{ marginLeft: tokens.spacingHorizontalXS }}
            />
          )}
        </Tab>
        <Tab value="checked-out">
          Checked-Out Drawings
          {checkedOutCount > 0 && (
            <CounterBadge
              count={checkedOutCount}
              color="important"
              size="small"
              style={{ marginLeft: tokens.spacingHorizontalXS }}
            />
          )}
        </Tab>
      </TabList>

      {/* ── Reservations tab ── */}
      {activeTab === "reservations" && (
        <div className={styles.tabContent}>
          {query.isPending && <Spinner label="Loading…" />}

          {query.isError && (
            <MessageBar intent="error">
              <MessageBarBody>Failed to load reservations. Please refresh.</MessageBarBody>
            </MessageBar>
          )}

          {query.data && (
            <>
              <div className={styles.toolbar}>
                <Input
                  className={styles.searchInput}
                  placeholder="Search by ID, composition, or reason"
                  value={search}
                  onChange={(_, d) => { setSearch(d.value); setResPage(1); }}
                  aria-label="Search reservations"
                />
                <Text size={200} style={{ marginLeft: "auto" }}>
                  {filtered.length} reservation{filtered.length !== 1 ? "s" : ""}
                </Text>
              </div>

              <DataGrid
                items={resPaged}
                columns={reservationColumns}
                sortable
                getRowId={(r) => r.enmax_acdnreservationid}
                focusMode="composite"
              >
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => (
                      <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                    )}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody<PendingReservation>>
                  {({ item, rowId }) => (
                    <DataGridRow<PendingReservation>
                      key={rowId}
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/reservations/${item.enmax_acdnreservationid}`)}
                    >
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>

              {resTotalPages > 1 && (
                <div className={styles.pagination}>
                  <Button
                    icon={<ChevronLeft16Regular />}
                    appearance="subtle"
                    disabled={resSafePage <= 1}
                    onClick={() => setResPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  />
                  <Text size={200}>
                    Page {resSafePage} of {resTotalPages}
                    {" · "}
                    {(resSafePage - 1) * pageSize + 1}–{Math.min(resSafePage * pageSize, filtered.length)} of {filtered.length}
                  </Text>
                  <Button
                    icon={<ChevronRight16Regular />}
                    appearance="subtle"
                    disabled={resSafePage >= resTotalPages}
                    onClick={() => setResPage((p) => Math.min(resTotalPages, p + 1))}
                    aria-label="Next page"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Checked-Out Drawings tab ── */}
      {activeTab === "checked-out" && (
        <div className={styles.tabContent}>
          {checkoutQuery.isPending && <Spinner size="tiny" label="Loading…" />}

          {checkoutQuery.isError && (
            <MessageBar intent="error">
              <MessageBarBody>Failed to load checked-out drawings. Please refresh.</MessageBarBody>
            </MessageBar>
          )}

          {!checkoutQuery.isPending && checkouts.length === 0 && (
            <Text style={{ color: tokens.colorNeutralForeground3 }}>
              No drawings currently checked out.
            </Text>
          )}

          {checkouts.length > 0 && (
            <>
              <DataGrid
                items={coPaged}
                columns={checkoutColumns}
                getRowId={(r) => r.drawing.id}
                focusMode="composite"
              >
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => (
                      <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                    )}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody<CheckedOutDrawingRow>>
                  {({ item, rowId }) => (
                    <DataGridRow<CheckedOutDrawingRow>
                      key={rowId}
                      style={item.reservationId ? { cursor: "pointer" } : undefined}
                      onClick={() => {
                        if (item.reservationId) {
                          navigate(`/reservations/${item.reservationId}`, {
                            state: { expandDrawingId: item.drawing.id },
                          });
                        }
                      }}
                    >
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>

              {coTotalPages > 1 && (
                <div className={styles.pagination}>
                  <Button
                    icon={<ChevronLeft16Regular />}
                    appearance="subtle"
                    disabled={coSafePage <= 1}
                    onClick={() => setCheckoutPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  />
                  <Text size={200}>
                    Page {coSafePage} of {coTotalPages}
                    {" · "}
                    {(coSafePage - 1) * pageSize + 1}–{Math.min(coSafePage * pageSize, checkouts.length)} of {checkouts.length}
                  </Text>
                  <Button
                    icon={<ChevronRight16Regular />}
                    appearance="subtle"
                    disabled={coSafePage >= coTotalPages}
                    onClick={() => setCheckoutPage((p) => Math.min(coTotalPages, p + 1))}
                    aria-label="Next page"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
