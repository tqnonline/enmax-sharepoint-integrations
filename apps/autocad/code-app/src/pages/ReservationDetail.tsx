import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ReservationDocumentSheetsGrid } from "../features/checkout/components/ReservationDocumentSheetsGrid";
import { useAppConfig } from "../config/useAppConfig";
import {
  reservationChildNounPlural,
  reservationHasChildItems,
  reservationRecordsLabel,
} from "../features/reserve/terminology";
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
  ArrowClockwise20Regular,
  ChevronLeft16Regular,
  ChevronRight16Regular,
  DismissCircle20Regular,
} from "@fluentui/react-icons";
import { useReservationDetail, type DrawingDetail } from "../features/approvals/hooks/useReservationDetail";
import { NUMBERING_GROUP_LABEL } from "../features/reserve/numberingTerms";
import { formatNumberRange, formatAppendDisplay, formatReservationDisplay } from "../features/approvals/compositionUtils";
import { useCancelReservation } from "../features/myitems/useMyReservations";
import { useRetryIssueNumbers } from "../features/approvals/hooks/useRetryIssueNumbers";
import { useRetryAppend } from "../features/approvals/hooks/useRetryAppend";
import { useUserRole } from "../auth/useUserRole";
import { usePageSize } from "../config/usePageSize";
import { useCurrentUser } from "../auth/useCurrentUser";
import { isCheckoutEnabledForTaxonomy } from "../config/checkoutTaxonomyConfig";

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

/** Available + never checked out → Allocated (issuance only). */
function drawingStatePresentation(
  state: number,
  currentRevision?: string,
): { label: string; color: BadgeColor } {
  const base = DRAWING_STATE_MAP[state] ?? DRAWING_STATE_MAP[1];
  if (state === 1 && !currentRevision) {
    return { label: "Allocated", color: "success" };
  }
  return base;
}


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
    paddingLeft: tokens.spacingHorizontalS,
    paddingBottom: tokens.spacingVerticalS,
  },
  sheetSummary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    marginBottom: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  sheetTableHeader: {
    display: "grid",
    gridTemplateColumns: "36px minmax(180px, 1.2fr) minmax(120px, 0.8fr) minmax(160px, 1fr) minmax(160px, 1fr) minmax(140px, auto)",
    gap: tokens.spacingHorizontalS,
    alignItems: "center",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}`,
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  sheetRow: {
    display: "grid",
    gridTemplateColumns: "36px minmax(180px, 1.2fr) minmax(120px, 0.8fr) minmax(160px, 1fr) minmax(160px, 1fr) minmax(140px, auto)",
    gap: tokens.spacingHorizontalS,
    alignItems: "center",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXS}`,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  sheetNumber: {
    color: tokens.colorNeutralForeground1,
    flexShrink: 0,
    fontFamily: tokens.fontFamilyMonospace,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  sheetMeta: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  sheetMetaMuted: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  sheetActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: tokens.spacingHorizontalXS,
    flexWrap: "nowrap",
  },
  newBadgeWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
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

const DETAIL_TOASTER_ID = "reservation-detail-toaster";

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
  const styles = useStyles();
  const query = useReservationDetail(reservationId);
  const queryClient = useQueryClient();
  const pageSize = usePageSize();
  const appConfig = useAppConfig();
  const { data: currentUser } = useCurrentUser();
  const { role } = useUserRole();
  const retryIssueMutation = useRetryIssueNumbers();
  const retryAppendMutation = useRetryAppend();
  const [drawingPage, setDrawingPage] = useState(1);
  const [sheetIds, setSheetIds] = useState<string[]>([]);
  const onSheetIdsChange = useCallback((ids: string[]) => setSheetIds(ids), []);

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
  const recordsLabel = reservationRecordsLabel(res.reservationType, res.documentSubtype);
  const recordsLabelLower = recordsLabel.toLowerCase();
  const childSheetsLabel = reservationChildNounPlural(res.reservationType, res.documentSubtype);
  const hasChildItems = reservationHasChildItems(res.reservationType, res.documentSubtype);
  const checkoutEnabled = isCheckoutEnabledForTaxonomy(
    appConfig,
    res.reservationType,
    res.documentSubtype,
  );
  const canCancel = res.status === 1 && !!currentUser?.id && currentUser.id === res.submitterId;
  const numberRange = res.issuedNumbers
    ? formatNumberRange(res.issuedNumbers)
    : (res.appendFirst != null && res.appendLast != null
      ? formatAppendDisplay(res.targetDrawingNumber, res.appendFirst, res.appendLast)
      : "");
  const isAppend = res.sequenceType === 2 && !!res.targetDrawingId;
  const needsIssuanceRetry = res.status === 2 && !res.issuedNumbers && !isAppend;
  const needsAppendRetry = res.status === 2 && isAppend && res.appendFirst == null;
  const canRetryIssuance   = (role === "Approver" || role === "Admin") && needsIssuanceRetry;
  const canRetryAppend     = (role === "Approver" || role === "Admin") && needsAppendRetry;
  const hasComposition = [res.businessCode, res.assetCode, res.unitCode, res.domainCode, res.systemCode, res.kindCode].some(Boolean);

  const allDrawings = res.drawings;
  const totalDrawingPages = Math.max(1, Math.ceil(allDrawings.length / pageSize));
  const safeDrawingPage   = Math.min(drawingPage, totalDrawingPages);
  const pagedDrawings     = allDrawings.slice((safeDrawingPage - 1) * pageSize, safeDrawingPage * pageSize);
  const sectionTitle = hasChildItems ? childSheetsLabel : recordsLabel;
  const sectionCount = hasChildItems ? sheetIds.length || "…" : allDrawings.length;

  return (
    <div className={styles.page}>
      <Toaster toasterId={DETAIL_TOASTER_ID} />
      {/* Back */}
      <div className={styles.nav}>
        <Button appearance="subtle" icon={<ArrowLeft20Regular />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      {needsAppendRetry && (
        <MessageBar intent="warning" style={{ marginBottom: tokens.spacingVerticalM }}>
          <MessageBarBody>
            This add-to-existing reservation was approved but child items were not appended.
            {canRetryAppend ? (
              <>
                {" "}
                <Button
                  appearance="primary"
                  size="small"
                  icon={retryAppendMutation.isPending ? <Spinner size="tiny" /> : <ArrowClockwise20Regular />}
                  disabled={retryAppendMutation.isPending}
                  onClick={() => retryAppendMutation.mutate({ reservationId: res.id })}
                  style={{ marginLeft: tokens.spacingHorizontalS, verticalAlign: "middle" }}
                >
                  Retry append
                </Button>
              </>
            ) : (
              " Ask an approver to open this reservation and retry the append."
            )}
            {retryAppendMutation.isError && (
              <Text block style={{ marginTop: tokens.spacingVerticalS, color: tokens.colorPaletteRedForeground1 }}>
                {(retryAppendMutation.error as Error).message}
              </Text>
            )}
          </MessageBarBody>
        </MessageBar>
      )}

      {needsIssuanceRetry && (
        <MessageBar intent="warning" style={{ marginBottom: tokens.spacingVerticalM }}>
          <MessageBarBody>
            This reservation was approved but issue numbers were never assigned, so no {recordsLabelLower} were created.
            {canRetryIssuance ? (
              <>
                {" "}
                <Button
                  appearance="primary"
                  size="small"
                  icon={retryIssueMutation.isPending ? <Spinner size="tiny" /> : <ArrowClockwise20Regular />}
                  disabled={retryIssueMutation.isPending}
                  onClick={() => retryIssueMutation.mutate({ reservationId: res.id })}
                  style={{ marginLeft: tokens.spacingHorizontalS, verticalAlign: "middle" }}
                >
                  Retry number issuance
                </Button>
              </>
            ) : (
              " Ask an approver to open this reservation and retry number issuance."
            )}
            {retryIssueMutation.isError && (
              <Text block style={{ marginTop: tokens.spacingVerticalS, color: tokens.colorPaletteRedForeground1 }}>
                {(retryIssueMutation.error as Error).message}
              </Text>
            )}
          </MessageBarBody>
        </MessageBar>
      )}

      {/* Header */}
      <div className={styles.header} style={{ borderLeftColor: status.accentToken }}>
        {/* Title + meta columns */}
        <div className={styles.headerTop}>
          <Title2 as="h1" className={styles.resTitle}>
            {formatReservationDisplay({
              businessCode: res.businessCode,
              assetCode: res.assetCode,
              unitCode: res.unitCode,
              domainCode: res.domainCode,
              systemCode: res.systemCode,
              kindCode: res.kindCode,
              enmax_acdnissuednumbers: res.issuedNumbers,
              sequenceType: res.sequenceType,
              targetDrawingId: res.targetDrawingId,
              targetDrawingNumber: res.targetDrawingNumber,
              appendFirst: res.appendFirst,
              appendLast: res.appendLast,
            })}
          </Title2>
          <div className={styles.headerMetaCols}>
            <div className={styles.headerMetaCol}>
              <span className={styles.metaLabel}>Submitted</span>
              <Text size={300}>{relativeTime(res.createdon)}</Text>
            </div>
            <div className={styles.headerMetaCol}>
              <span className={styles.metaLabel}>Type</span>
              <Text size={300} weight="semibold">{res.typeLabel}</Text>
            </div>
            <div className={styles.headerMetaCol}>
              <span className={styles.metaLabel}>Count</span>
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
            <span className={styles.compSectionLabel}>{NUMBERING_GROUP_LABEL}</span>
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

      {/* Drawings / drawing documents */}
      <div className={styles.drawingsSection}>
        <div className={styles.drawingsHeading}>
          <Title3 as="h2" style={{ margin: 0 }}>{sectionTitle}</Title3>
          <Badge appearance="outline" shape="rounded">{sectionCount}</Badge>
          {query.isFetching && !!query.data && <Spinner size="tiny" />}
          <div className={styles.drawingsHeadingActions}>
            <Tooltip content={`Refresh ${sectionTitle.toLowerCase()}`} relationship="label">
              <Button
                appearance="subtle"
                icon={<ArrowClockwise20Regular />}
                size="small"
                aria-label={`Refresh ${sectionTitle.toLowerCase()}`}
                onClick={() => {
                  void query.refetch();
                  void queryClient.invalidateQueries({ queryKey: ["reservation-sheets"] });
                  void queryClient.invalidateQueries({ queryKey: ["drawing-sheets"] });
                  void queryClient.invalidateQueries({ queryKey: ["sheet-checkouts"] });
                }}
              />
            </Tooltip>
          </div>
        </div>

        {allDrawings.length === 0 && (
          <MessageBar intent="info">
            <MessageBarBody>
              {res.status === 1
                ? `${recordsLabel} will be created once this reservation is approved.`
                : res.status === 3
                  ? `No ${recordsLabelLower} were created — reservation was declined.`
                  : `No ${recordsLabelLower} found for this reservation.`}
            </MessageBarBody>
          </MessageBar>
        )}

        {allDrawings.length > 0 && hasChildItems && (
          <ReservationDocumentSheetsGrid
            drawings={allDrawings.map((d) => ({ id: d.id, number: d.number }))}
            reservationType={res.reservationType}
            documentSubtype={res.documentSubtype}
            checkoutEnabled={checkoutEnabled}
            appendFirst={res.appendFirst}
            appendLast={res.appendLast}
            toasterId={DETAIL_TOASTER_ID}
            onSheetIdsChange={onSheetIdsChange}
          />
        )}

        {allDrawings.length > 0 && !hasChildItems && (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th className={styles.compColLabel} style={{ textAlign: "left", padding: tokens.spacingVerticalS }}>
                    {recordsLabel.replace(/s$/, "")} #
                  </th>
                  <th className={styles.compColLabel} style={{ textAlign: "left", padding: tokens.spacingVerticalS }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedDrawings.map((drawing: DrawingDetail) => {
                  const ds = drawingStatePresentation(drawing.state, drawing.currentRevision);
                  return (
                    <tr key={drawing.id}>
                      <td style={{ padding: tokens.spacingVerticalS }}>
                        <Text className={styles.monospace} weight="semibold">
                          {drawing.number ?? drawing.id}
                        </Text>
                      </td>
                      <td style={{ padding: tokens.spacingVerticalS }}>
                        <Badge appearance="tint" color={ds.color} size="small">{ds.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalDrawingPages > 1 && (
              <div className={styles.drawingsPagination}>
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
                  {(safeDrawingPage - 1) * pageSize + 1}–{Math.min(safeDrawingPage * pageSize, allDrawings.length)} of {allDrawings.length}
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
      </div>
    </div>
  );
}
