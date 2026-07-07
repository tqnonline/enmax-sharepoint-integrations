import { useState, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useReservationDrawings } from "../features/checkout/hooks/useReservationDrawings";
import { DrawingActionsPanel } from "../features/checkout/components/DrawingActionsPanel";
import type { CheckoutForPanel, DrawingStateValue } from "../features/checkout/api/checkoutClient";
import {
  Title2,
  Title3,
  Text,
  Badge,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  Divider,
  Tooltip,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  TabList,
  Tab,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Toast,
  ToastTitle,
  Toaster,
  useToastController,
  useId,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import {
  ArrowLeft20Regular,
  Warning24Regular,
  FolderOpen20Regular,
  ArrowSquareUpRightRegular,
  Document16Regular,
  ArrowClockwise20Regular,
  ChevronLeft16Regular,
  ChevronRight16Regular,
  DismissCircle20Regular,
} from "@fluentui/react-icons";
import { useReservationDetail, type DrawingDetail } from "../features/approvals/hooks/useReservationDetail";
import { useDrawingSheets } from "../features/approvals/hooks/useDrawingSheets";
import { useCancelReservation } from "../features/myitems/useMyReservations";
import { formatNumberRange } from "../features/approvals/compositionUtils";
import { usePageSize } from "../config/usePageSize";
import { useCurrentUser } from "../auth/useCurrentUser";

type BadgeColor = "success" | "warning" | "informative" | "subtle" | "danger";

const STATUS_MAP: Record<number, { label: string; color: BadgeColor; accentToken: string }> = {
  1: { label: "Pending",   color: "informative", accentToken: tokens.colorBrandForeground1 },
  2: { label: "Approved",  color: "success",     accentToken: tokens.colorPaletteGreenForeground2 },
  3: { label: "Declined",  color: "subtle",      accentToken: tokens.colorNeutralForeground3 },
  4: { label: "Cancelled", color: "subtle",      accentToken: tokens.colorNeutralForeground3 },
};

const DRAWING_STATE_MAP: Record<number, { label: string; color: BadgeColor }> = {
  0: { label: "None",                color: "subtle" },
  1: { label: "Available",           color: "success" },
  2: { label: "Checked Out",         color: "warning" },
  3: { label: "Awaiting Validation", color: "informative" },
  4: { label: "Checked In",          color: "success" },
  5: { label: "Obsolete",            color: "subtle" },
  6: { label: "Void",               color: "danger" },
};


function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "1 day ago" : `${days}d ago`;
}

const FADE_UP = {
  from: { opacity: "0", transform: "translateY(8px)" },
  to:   { opacity: "1", transform: "translateY(0)" },
};

const useStyles = makeStyles({
  page: {
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXL}`,
  },
  nav: {
    marginBottom: tokens.spacingVerticalL,
  },
  // Header
  header: {
    paddingLeft: tokens.spacingHorizontalL,
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    marginBottom: tokens.spacingVerticalXL,
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationFillMode: "both",
  },
  headerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalL,
    marginBottom: tokens.spacingVerticalXS,
    flexWrap: "wrap",
  },
  resTitle: {
    fontFamily: tokens.fontFamilyMonospace,
    margin: 0,
    lineHeight: "1",
    flexShrink: 0,
  },
  headerMetaCols: {
    display: "flex",
    gap: tokens.spacingHorizontalXL,
    alignItems: "flex-start",
    flexShrink: 0,
  },
  headerMetaCol: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: "72px",
  },
  metaLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  headerStatusRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
    flexWrap: "wrap",
  },
  personName: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  // Two-column info grid
  infoGrid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    columnGap: tokens.spacingHorizontalXXL,
    rowGap: 0,
    marginBottom: tokens.spacingVerticalM,
    "@media (max-width: 600px)": { gridTemplateColumns: "1fr" },
  },
  infoCol: {
    display: "flex",
    flexDirection: "column",
  },
  infoRow: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    alignItems: "baseline",
    padding: `${tokens.spacingVerticalXXS} 0`,
  },
  infoLabel: {
    color: tokens.colorNeutralForeground2,
    fontWeight: tokens.fontWeightBold,
    fontSize: tokens.fontSizeBase200,
    minWidth: "96px",
    flexShrink: 0,
  },
  infoValue: {
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  // Composition flat row
  compSection: {
    marginTop: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalS,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2,
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationDelay: "50ms",
    animationFillMode: "both",
  },
  compSectionLabel: {
    display: "block",
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: tokens.spacingVerticalXS,
  },
  compRow: {
    display: "flex",
    gap: tokens.spacingHorizontalXL,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  compCol: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  compColLabel: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  compColValue: {
    fontFamily: tokens.fontFamilyMonospace,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  declineText: {
    color: tokens.colorPaletteRedForeground1,
  },
  monospace: {
    fontFamily: tokens.fontFamilyMonospace,
  },
  // Drawings
  drawingsSection: {
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationDelay: "150ms",
    animationFillMode: "both",
  },
  drawingsHeading: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
    flexWrap: "wrap",
  },
  drawingsHeadingActions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    marginLeft: "auto",
  },
  drawingsPagination: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalM,
    flexWrap: "wrap",
  },
  drawingRowContent: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    flex: 1,
  },
  sheetList: {
    paddingLeft: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalS,
  },
  sheetRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} 0`,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  sheetNumber: {
    minWidth: "56px",
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
  filename: {
    flex: 1,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    overflowWrap: "break-word",
    wordBreak: "break-all",
  },
  emptyState: {
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
    color: tokens.colorNeutralForeground3,
    textAlign: "center",
  },
  warningStripe: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorPaletteRedBackground2,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorPaletteRedForeground1,
  },
  cancelError: {
    color: tokens.colorPaletteRedForeground1,
    display: "block",
    marginTop: tokens.spacingVerticalXS,
  },
  cancelConfirm: {
    backgroundColor: tokens.colorPaletteRedBackground3,
    color: tokens.colorNeutralForegroundOnBrand,
  },
});

function DrawingSheetList({ drawingId }: { drawingId: string }) {
  const styles = useStyles();
  const { data: sheets, isPending } = useDrawingSheets(drawingId, true);

  if (isPending) return <Spinner size="tiny" label="Loading sheets…" style={{ margin: tokens.spacingVerticalS }} />;
  if (!sheets || sheets.length === 0) {
    return <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>No sheets found.</Text>;
  }
  return (
    <>
      {sheets.map(sheet => (
        <div key={sheet.id} className={styles.sheetRow}>
          <Document16Regular style={{ color: tokens.colorNeutralForeground3, flexShrink: 0 }} />
          <Text size={200} className={styles.sheetNumber}>Sheet {sheet.sheetNumber ?? "—"}</Text>
          <Text size={200} className={styles.filename}>{sheet.filename ?? "—"}</Text>
          {sheet.sharepointUrl ? (
            <Tooltip content="Open in SharePoint" relationship="label">
              <Button
                as="a"
                href={sheet.sharepointUrl}
                target="_blank"
                rel="noopener noreferrer"
                appearance="subtle"
                icon={<ArrowSquareUpRightRegular />}
                size="small"
                aria-label="Open in SharePoint"
              />
            </Tooltip>
          ) : (
            <Button appearance="subtle" icon={<ArrowSquareUpRightRegular />} size="small" disabled aria-label="SharePoint URL not yet available" />
          )}
        </div>
      ))}
    </>
  );
}

function DrawingRow({ drawing, isOpen, checkout, missingSheets }: {
  drawing: DrawingDetail;
  isOpen: boolean;
  checkout?: CheckoutForPanel;
  missingSheets?: string;
}) {
  const styles = useStyles();
  const ds = DRAWING_STATE_MAP[drawing.state] ?? DRAWING_STATE_MAP[1];
  const showActions = checkout !== undefined || drawing.state === 1;
  const drawingForPanel = {
    id: drawing.id,
    state: drawing.state as DrawingStateValue,
    number: drawing.number,
    spLibraryUrl: drawing.spLibraryUrl,
    currentRevision: drawing.currentRevision,
    missingSheets,
  };

  return (
    <AccordionItem value={drawing.id}>
      <AccordionHeader
        button={
          drawing.spLibraryUrl ? (
            <Tooltip content="Open SharePoint folder" relationship="label">
              <Button
                as="a"
                href={drawing.spLibraryUrl}
                target="_blank"
                rel="noopener noreferrer"
                appearance="subtle"
                icon={<FolderOpen20Regular />}
                size="small"
                onClick={(e) => e.stopPropagation()}
                aria-label="Open SharePoint folder"
              />
            </Tooltip>
          ) : undefined
        }
      >
        <div className={styles.drawingRowContent}>
          <Text className={styles.monospace} weight="semibold">{drawing.number ?? drawing.id}</Text>
          <Badge appearance="tint" color={ds.color} size="small">{ds.label}</Badge>
        </div>
      </AccordionHeader>
      <AccordionPanel>
        <div className={styles.sheetList}>
          {showActions && isOpen && (
            <div style={{ marginBottom: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalS, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
              <DrawingActionsPanel drawing={drawingForPanel} openCheckout={checkout} />
            </div>
          )}
          {isOpen && <DrawingSheetList drawingId={drawing.id} />}
        </div>
      </AccordionPanel>
    </AccordionItem>
  );
}

function CancelReservationControl({ reservationId }: { reservationId: string }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const mutation = useCancelReservation();
  const toasterId = useId("cancel-reservation-toaster");
  const { dispatchToast } = useToastController(toasterId);

  function handleConfirm() {
    mutation.mutate(reservationId, {
      onSuccess: () => {
        setOpen(false);
        dispatchToast(
          <Toast><ToastTitle>Reservation cancelled</ToastTitle></Toast>,
          { intent: "success" },
        );
      },
    });
  }

  return (
    <>
      <Button
        appearance="outline"
        icon={<DismissCircle20Regular />}
        style={{ marginLeft: "auto", color: tokens.colorPaletteRedForeground1, borderColor: tokens.colorPaletteRedForeground1 }}
        onClick={() => { mutation.reset(); setOpen(true); }}
      >
        Cancel Reservation
      </Button>
      <Toaster toasterId={toasterId} />
      <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) setOpen(false); }}>
        <DialogSurface>
          <DialogTitle>Cancel reservation</DialogTitle>
          <DialogBody>
            <DialogContent>
              <div className={styles.warningStripe}>
                <Warning24Regular />
                <Text weight="semibold">Cancelling withdraws this pending reservation. This cannot be undone.</Text>
              </div>
              {mutation.isError && (
                <Text className={styles.cancelError} size={200}>
                  {mutation.error?.message ?? "Cancel failed. Try again."}
                </Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setOpen(false)} disabled={mutation.isPending}>
                Keep Reservation
              </Button>
              <Button
                appearance="primary"
                className={styles.cancelConfirm}
                disabled={mutation.isPending}
                onClick={handleConfirm}
              >
                {mutation.isPending ? <Spinner size="tiny" /> : "Confirm Cancel"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}

export default function ReservationDetail() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const styles = useStyles();
  const query = useReservationDetail(reservationId);
  const queryClient = useQueryClient();
  const pageSize = usePageSize();
  const { data: currentUser } = useCurrentUser();
  const expandDrawingId = (location.state as { expandDrawingId?: string } | null)?.expandDrawingId;
  const [openItems, setOpenItems] = useState<string[]>(() => expandDrawingId ? [expandDrawingId] : []);
  const [drawingPage, setDrawingPage] = useState(1);
  const [drawingTab, setDrawingTab] = useState<"all" | "checked-out">("all");

  const drawingsQuery = useReservationDrawings(
    query.data?.status === 2 ? reservationId ?? null : null,
  );
  const checkoutMap = useMemo(() => {
    const map = new Map<string, { checkout?: CheckoutForPanel; missingSheets?: string }>();
    for (const row of drawingsQuery.data ?? []) {
      map.set(row.drawing.id, { checkout: row.checkout, missingSheets: row.drawing.missingSheets });
    }
    return map;
  }, [drawingsQuery.data]);

  if (query.isPending) {
    return <Spinner label="Loading reservation…" style={{ marginTop: tokens.spacingVerticalXXL }} />;
  }

  if (query.isError || !query.data) {
    return (
      <div className={styles.page}>
        <Button appearance="subtle" icon={<ArrowLeft20Regular />} onClick={() => navigate(-1)} style={{ marginBottom: tokens.spacingVerticalM }}>
          Back
        </Button>
        <MessageBar intent="error">
          <MessageBarBody>Failed to load reservation. Please refresh.</MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  const res = query.data;
  const status = STATUS_MAP[res.status] ?? STATUS_MAP[1];
  const canCancel = res.status === 1 && !!currentUser?.id && currentUser.id === res.submitterId;
  const numberRange = formatNumberRange(res.issuedNumbers);
  const hasComposition = [res.businessCode, res.assetCode, res.unitCode, res.domainCode, res.systemCode, res.kindCode].some(Boolean);

  const filteredDrawings  = drawingTab === "checked-out"
    ? res.drawings.filter(d => d.state === 2 || d.state === 3)
    : res.drawings;
  const totalDrawingPages = Math.max(1, Math.ceil(filteredDrawings.length / pageSize));
  const safeDrawingPage   = Math.min(drawingPage, totalDrawingPages);
  const pagedDrawings     = filteredDrawings.slice((safeDrawingPage - 1) * pageSize, safeDrawingPage * pageSize);
  const checkedOutCount   = res.drawings.filter(d => d.state === 2 || d.state === 3).length;

  return (
    <div className={styles.page}>
      {/* Back */}
      <div className={styles.nav}>
        <Button appearance="subtle" icon={<ArrowLeft20Regular />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      {/* Header */}
      <div className={styles.header} style={{ borderLeftColor: status.accentToken }}>
        {/* Title + meta columns */}
        <div className={styles.headerTop}>
          <Title2 as="h1" className={styles.resTitle}>{res.number}</Title2>
          <div className={styles.headerMetaCols}>
            <div className={styles.headerMetaCol}>
              <span className={styles.metaLabel}>Submitted</span>
              <Text size={300}>{relativeTime(res.createdon)}</Text>
            </div>
            <div className={styles.headerMetaCol}>
              <span className={styles.metaLabel}>Drawing Count</span>
              <Text size={300} weight="semibold">{res.drawingCount}</Text>
            </div>
            {res.submitterName && (
              <div className={styles.headerMetaCol}>
                <span className={styles.metaLabel}>Submitted By</span>
                <Text size={300} weight="semibold" className={styles.personName}>{res.submitterName}</Text>
              </div>
            )}
          </div>
        </div>

        {/* Status + person */}
        <div className={styles.headerStatusRow}>
          <Badge appearance="filled" color={status.color} shape="rounded">{status.label}</Badge>
          {res.override && (
            <Badge icon={<Warning24Regular />} color="warning" shape="rounded">Validation Override</Badge>
          )}
          {canCancel && <CancelReservationControl reservationId={res.id} />}
        </div>

        {/* Info grid */}
        <div className={styles.infoGrid2}>
          <div className={styles.infoCol}>
            {res.businessName && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Business</span>
                <span className={styles.infoValue}>{res.businessName}</span>
              </div>
            )}
            {res.assetName && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Asset</span>
                <span className={styles.infoValue}>{res.assetName}</span>
              </div>
            )}
            {res.systemName && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>System</span>
                <span className={styles.infoValue}>{res.systemName}</span>
              </div>
            )}
            {numberRange && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Issue Number</span>
                <span className={`${styles.infoValue} ${styles.monospace}`}>{numberRange}</span>
              </div>
            )}
            {res.reason && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Reason</span>
                <span className={styles.infoValue}>{res.reason}</span>
              </div>
            )}
          </div>
          <div className={styles.infoCol}>
            {res.domainName && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Domain</span>
                <span className={styles.infoValue}>{res.domainName}</span>
              </div>
            )}
            {res.unitName && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Unit</span>
                <span className={styles.infoValue}>{res.unitName}</span>
              </div>
            )}
            {res.kindName && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Kind</span>
                <span className={styles.infoValue}>{res.kindName}</span>
              </div>
            )}
            {res.declineReason && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Decline Reason</span>
                <span className={`${styles.infoValue} ${styles.declineText}`}>{res.declineReason}</span>
              </div>
            )}
          </div>
        </div>

        {/* Composition flat row */}
        {hasComposition && (
          <div className={styles.compSection}>
            <span className={styles.compSectionLabel}>Drawing/Document Number</span>
            <div className={styles.compRow}>
              {res.businessCode && (
                <div className={styles.compCol}>
                  <span className={styles.compColLabel}>Bus</span>
                  <span className={styles.compColValue}>{res.businessCode}</span>
                </div>
              )}
              {res.assetCode && (
                <div className={styles.compCol}>
                  <span className={styles.compColLabel}>Asset</span>
                  <span className={styles.compColValue}>{res.assetCode}</span>
                </div>
              )}
              {res.unitCode && (
                <div className={styles.compCol}>
                  <span className={styles.compColLabel}>Unit</span>
                  <span className={styles.compColValue}>{res.unitCode}</span>
                </div>
              )}
              {res.domainCode && (
                <div className={styles.compCol}>
                  <span className={styles.compColLabel}>Dom</span>
                  <span className={styles.compColValue}>{res.domainCode}</span>
                </div>
              )}
              {res.systemCode && (
                <div className={styles.compCol}>
                  <span className={styles.compColLabel}>Sys</span>
                  <span className={styles.compColValue}>{res.systemCode}</span>
                </div>
              )}
              {res.kindCode && (
                <div className={styles.compCol}>
                  <span className={styles.compColLabel}>Kind</span>
                  <span className={styles.compColValue}>{res.kindCode}</span>
                </div>
              )}
              {numberRange && (
                <div className={styles.compCol}>
                  <span className={styles.compColLabel}>No.</span>
                  <span className={styles.compColValue}>{numberRange}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Divider style={{ marginBottom: tokens.spacingVerticalL }} />

      {/* Drawings */}
      <div className={styles.drawingsSection}>
        <div className={styles.drawingsHeading}>
          <Title3 as="h2" style={{ margin: 0 }}>Drawings</Title3>
          <Badge appearance="outline" shape="rounded">{filteredDrawings.length}</Badge>
          {query.isFetching && !!query.data && <Spinner size="tiny" />}
          <TabList
            selectedValue={drawingTab}
            onTabSelect={(_, d) => {
              setDrawingTab(d.value as "all" | "checked-out");
              setDrawingPage(1);
              setOpenItems([]);
            }}
            size="small"
          >
            <Tab value="all">All <Badge appearance="outline" size="small">{res.drawings.length}</Badge></Tab>
            <Tab value="checked-out">Checked Out <Badge appearance="outline" size="small">{checkedOutCount}</Badge></Tab>
          </TabList>
          <div className={styles.drawingsHeadingActions}>
            {res.drawings.length > 0 && (
              <>
                <Button
                  appearance="subtle"
                  size="small"
                  onClick={() => setOpenItems(pagedDrawings.map(d => d.id))}
                >
                  Expand All
                </Button>
                <Button
                  appearance="subtle"
                  size="small"
                  onClick={() => setOpenItems([])}
                >
                  Collapse All
                </Button>
              </>
            )}
            <Tooltip content="Refresh drawings and sheets" relationship="label">
              <Button
                appearance="subtle"
                icon={<ArrowClockwise20Regular />}
                size="small"
                aria-label="Refresh drawings and sheets"
                onClick={() => {
                  void query.refetch();
                  void queryClient.invalidateQueries({ queryKey: ["drawing-sheets"] });
                }}
              />
            </Tooltip>
          </div>
        </div>

        {filteredDrawings.length === 0 && (
          <MessageBar intent="info">
            <MessageBarBody>
              {res.drawings.length === 0
                ? res.status === 1
                  ? "Drawings will be created once this reservation is approved."
                  : res.status === 3
                  ? "No drawings were created — reservation was declined."
                  : "No drawings found for this reservation."
                : "No checked-out drawings for this reservation."}
            </MessageBarBody>
          </MessageBar>
        )}

        {filteredDrawings.length > 0 && (
          <>
            <Accordion
              multiple
              collapsible
              openItems={openItems}
              onToggle={(_e, data) => {
                setOpenItems(data.openItems as string[]);
              }}
            >
              {pagedDrawings.map(drawing => {
                const co = checkoutMap.get(drawing.id);
                return (
                  <DrawingRow
                    key={drawing.id}
                    drawing={drawing}
                    isOpen={openItems.includes(drawing.id)}
                    checkout={co?.checkout}
                    missingSheets={co?.missingSheets}
                  />
                );
              })}
            </Accordion>
            {totalDrawingPages > 1 && (
              <div className={styles.drawingsPagination}>
                <Button
                  icon={<ChevronLeft16Regular />}
                  appearance="subtle"
                  disabled={safeDrawingPage <= 1}
                  onClick={() => { setDrawingPage((p) => Math.max(1, p - 1)); setOpenItems([]); }}
                  aria-label="Previous page"
                />
                <Text size={200}>
                  Page {safeDrawingPage} of {totalDrawingPages}
                  {" · "}
                  {(safeDrawingPage - 1) * pageSize + 1}–{Math.min(safeDrawingPage * pageSize, filteredDrawings.length)} of {filteredDrawings.length}
                </Text>
                <Button
                  icon={<ChevronRight16Regular />}
                  appearance="subtle"
                  disabled={safeDrawingPage >= totalDrawingPages}
                  onClick={() => { setDrawingPage((p) => Math.min(totalDrawingPages, p + 1)); setOpenItems([]); }}
                  aria-label="Next page"
                />
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
