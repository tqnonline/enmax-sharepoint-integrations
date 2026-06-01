import {
  OverlayDrawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Button,
  Text,
  Badge,
  Spinner,
  MessageBar,
  MessageBarBody,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  type TableColumnDefinition,
  createTableColumn,
  TableCellLayout,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { Dismiss24Regular, ChevronLeft16Regular, ChevronRight16Regular } from "@fluentui/react-icons";
import { useState, useEffect, useMemo } from "react";
import { usePageSize } from "../../../config/usePageSize";
import type { PendingReservation } from "../../approvals/hooks/usePendingReservations";
import { useReservationDrawings, type ReservationDrawingRow } from "../hooks/useReservationDrawings";
import { DrawingActionsPanel } from "./DrawingActionsPanel";
import { ReleaseDrawingsPanel } from "./ReleaseDrawingsPanel";
import { useCurrentUser } from "../../../auth/useCurrentUser";
import { useUserRole } from "../../../auth/useUserRole";
import { DrawingState, DRAWING_STATE_LABELS, DRAWING_STATE_BADGE_COLOR } from "../api/checkoutClient";
import type { BadgeColor } from "../api/checkoutClient";
import { formatComposition } from "../../approvals/compositionUtils";

function checkedOutSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}



function useScreenWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

const useStyles = makeStyles({
  meta: { color: tokens.colorNeutralForeground3, display: "block", marginBottom: tokens.spacingVerticalS },
  pagination: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalM,
    flexWrap: "wrap",
  },
  declineBox: {
    background: tokens.colorPaletteRedBackground1,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalM,
  },
  declineLabel: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorPaletteRedForeground1 },
});

const STATUS_BADGE: Record<number, { label: string; color: BadgeColor }> = {
  1: { label: "Pending",  color: "informative" },
  2: { label: "Approved", color: "success" },
  3: { label: "Declined", color: "subtle" },
};

interface Props {
  reservation: PendingReservation | null;
  onClose: () => void;
}

export function ReservationDrawingsPanel({ reservation, onClose }: Props) {
  const styles    = useStyles();
  const width     = useScreenWidth();
  const drawerSize = width >= 1024 ? "large" : "medium";
  const pageSize  = usePageSize();
  const [drawingPage, setDrawingPage] = useState(1);
  const [batchReleaseOpen, setBatchReleaseOpen] = useState(false);
  const { data: currentUser } = useCurrentUser();
  const { role } = useUserRole();
  const isAdmin = role === "Admin";

  const columns = useMemo((): TableColumnDefinition<ReservationDrawingRow>[] => [
    createTableColumn<ReservationDrawingRow>({
      columnId: "number",
      compare: (a, b) => (a.drawing.number ?? "").localeCompare(b.drawing.number ?? ""),
      renderHeaderCell: () => "Drawing",
      renderCell: ({ drawing }) => (
        <TableCellLayout>
          <Text style={{ fontFamily: "monospace" }}>{drawing.number ?? "—"}</Text>
        </TableCellLayout>
      ),
    }),
    createTableColumn<ReservationDrawingRow>({
      columnId: "state",
      renderHeaderCell: () => "Status",
      renderCell: ({ drawing }) => (
        <TableCellLayout>
          <Badge appearance="filled" color={DRAWING_STATE_BADGE_COLOR[drawing.state] ?? "subtle"} shape="rounded">
            {DRAWING_STATE_LABELS[drawing.state] ?? "Unknown"}
          </Badge>
        </TableCellLayout>
      ),
    }),
    createTableColumn<ReservationDrawingRow>({
      columnId: "revision",
      renderHeaderCell: () => "Rev",
      renderCell: ({ drawing }) => (
        <TableCellLayout>{drawing.currentRevision ?? "—"}</TableCellLayout>
      ),
    }),
    createTableColumn<ReservationDrawingRow>({
      columnId: "actions",
      renderHeaderCell: () => "Actions",
      renderCell: ({ drawing, checkout }) => (
        <TableCellLayout>
          <div>
            <DrawingActionsPanel drawing={drawing} openCheckout={checkout} variant="split" />
            {drawing.state === DrawingState.CheckedOut && checkout?.checkedOutOn && (
              <Text
                size={100}
                style={{ color: tokens.colorNeutralForeground3, display: "block", marginTop: "2px" }}
              >
                Checked out {checkedOutSince(checkout.checkedOutOn)}
              </Text>
            )}
          </div>
        </TableCellLayout>
      ),
    }),
  ], []);

  const drawingsQuery = useReservationDrawings(
    reservation?.enmax_acdnstatus === 2 ? reservation.enmax_acdnreservationid : null,
  );

  // Releasable = Available AND never checked out (currentRevision empty). A drawing
  // checked out even once is "used" and cannot be released.
  const availableDrawings = (drawingsQuery.data ?? [])
    .map((r) => r.drawing)
    .filter((d) => d.state === DrawingState.Available && !d.currentRevision);
  const canBatchRelease =
    availableDrawings.length > 0 &&
    (isAdmin || availableDrawings.some((d) => d.ownerId === currentUser?.id));

  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to page 1 when the selected reservation changes
  useEffect(() => { setDrawingPage(1); }, [reservation?.enmax_acdnreservationid]);

  const { pagedDrawings, totalDrawingPages } = useMemo(() => {
    const all = drawingsQuery.data ?? [];
    const total = Math.max(1, Math.ceil(all.length / pageSize));
    const safe  = Math.min(drawingPage, total);
    return {
      pagedDrawings: all.slice((safe - 1) * pageSize, safe * pageSize),
      totalDrawingPages: total,
    };
  }, [drawingsQuery.data, drawingPage, pageSize]);

  const safeDrawingPage = Math.min(drawingPage, totalDrawingPages);

  const statusBadge = reservation ? (STATUS_BADGE[reservation.enmax_acdnstatus] ?? STATUS_BADGE[1]) : null;

  return (
    <OverlayDrawer
      open={!!reservation}
      onOpenChange={(_, d) => { if (!d.open) onClose(); }}
      position="end"
      size={drawerSize}
      modalType="non-modal"
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} aria-label="Close" />
          }
        >
          {reservation?.enmax_acdnreservationnumber ?? "Reservation"}
        </DrawerHeaderTitle>
      </DrawerHeader>

      <DrawerBody>
        {reservation && (
          <>
            <Text className={styles.meta} style={{ fontFamily: "monospace" }}>
              {formatComposition(reservation)}
            </Text>

            {statusBadge && (
              <Badge appearance="filled" color={statusBadge.color} shape="rounded"
                style={{ marginBottom: tokens.spacingVerticalS }}>
                {statusBadge.label}
              </Badge>
            )}

            <Text className={styles.meta}>
              {reservation.enmax_acdndrawingcount} drawing{reservation.enmax_acdndrawingcount !== 1 ? "s" : ""}
            </Text>

            {reservation._createdby_value_Formatted && (
              <Text className={styles.meta}>
                Submitted by {reservation._createdby_value_Formatted}
              </Text>
            )}

            {reservation.createdon && (
              <Text className={styles.meta}>
                {new Date(reservation.createdon).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </Text>
            )}

            {reservation.enmax_acdnstatus === 3 && reservation.enmax_acdndeclinereason && (
              <div className={styles.declineBox}>
                <Text size={200} className={styles.declineLabel}>Decline reason</Text>
                <Text size={200}>{reservation.enmax_acdndeclinereason}</Text>
              </div>
            )}

            {reservation.enmax_acdnstatus === 1 && (
              <Text style={{ color: tokens.colorNeutralForeground3 }}>
                Drawings will be created once this reservation is approved.
              </Text>
            )}

            {reservation.enmax_acdnstatus === 3 && (
              <Text style={{ color: tokens.colorNeutralForeground3 }}>
                This reservation was declined. No drawings were created.
              </Text>
            )}

            {reservation.enmax_acdnstatus === 2 && (
              <>
                {drawingsQuery.isPending && <Spinner label="Loading drawings…" />}

                {drawingsQuery.isError && (
                  <MessageBar intent="error">
                    <MessageBarBody>Failed to load drawings. Please refresh.</MessageBarBody>
                  </MessageBar>
                )}

                {drawingsQuery.data && drawingsQuery.data.length === 0 && (
                  <Text style={{ color: tokens.colorNeutralForeground3 }}>
                    No drawings found for this reservation.
                  </Text>
                )}

                {drawingsQuery.data && drawingsQuery.data.length > 0 && (
                  <>
                    {canBatchRelease && (
                      <Button
                        appearance="outline"
                        onClick={() => setBatchReleaseOpen(true)}
                        style={{ marginBottom: tokens.spacingVerticalM }}
                      >
                        Release unused drawings
                      </Button>
                    )}
                    <DataGrid
                      items={pagedDrawings}
                      columns={columns}
                      sortable
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
                      <DataGridBody<ReservationDrawingRow>>
                        {({ item, rowId }) => (
                          <DataGridRow<ReservationDrawingRow> key={rowId}>
                            {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                          </DataGridRow>
                        )}
                      </DataGridBody>
                    </DataGrid>
                    {totalDrawingPages > 1 && (
                      <div className={styles.pagination}>
                        <Button
                          icon={<ChevronLeft16Regular />}
                          appearance="subtle"
                          disabled={safeDrawingPage <= 1}
                          onClick={() => setDrawingPage((p) => Math.max(1, p - 1))}
                          aria-label="Previous page"
                        />
                        <Text size={200}>
                          Page {safeDrawingPage} of {totalDrawingPages}
                          {" · "}
                          {(safeDrawingPage - 1) * pageSize + 1}–{Math.min(safeDrawingPage * pageSize, drawingsQuery.data.length)} of {drawingsQuery.data.length}
                        </Text>
                        <Button
                          icon={<ChevronRight16Regular />}
                          appearance="subtle"
                          disabled={safeDrawingPage >= totalDrawingPages}
                          onClick={() => setDrawingPage((p) => Math.min(totalDrawingPages, p + 1))}
                          aria-label="Next page"
                        />
                      </div>
                    )}
                  </>
                )}
                <ReleaseDrawingsPanel
                  drawings={availableDrawings}
                  open={batchReleaseOpen}
                  onOpenChange={setBatchReleaseOpen}
                />
              </>
            )}
          </>
        )}
      </DrawerBody>
    </OverlayDrawer>
  );
}
