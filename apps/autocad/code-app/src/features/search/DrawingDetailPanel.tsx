import { type ReactNode, useMemo } from "react";
import {
  Badge,
  Button,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Link,
  Spinner,
  Text,
  Toaster,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  DismissRegular,
  OpenRegular,
  Table24Regular,
} from "@fluentui/react-icons";
import { useNavigate, useLocation } from "react-router-dom";
import { DocumentTypeBadge } from "../../components/DocumentTypeBadge";
import { SheetDocumentActions } from "../checkout/components/SheetDocumentActions";
import { DrawingActionsPanel } from "../checkout/components/DrawingActionsPanel";
import {
  type DrawingStateValue,
  DRAWING_STATE_BADGE_COLOR,
  DRAWING_STATE_LABELS,
} from "../checkout/api/checkoutClient";
import {
  documentDisplayNumber,
  reservationChildNounPluralLower,
  reservationHasChildItems,
} from "../reserve/terminology";
import { useAppConfig } from "../../config/useAppConfig";
import { isCheckoutEnabledForTaxonomy } from "../../config/checkoutTaxonomyConfig";
import {
  preferSharePointDropOff,
  recordCarriesSharePointPdf,
  resolveSharePointFileUrls,
  sharePointFileUrl,
} from "../sharepoint/sharepointUrls";
import { buildDrawingFamilyPageUrl } from "./searchUrlState";
import { DocumentActivityTimeline } from "./DocumentActivityTimeline";
import { SheetStatusBadge } from "../checkout/components/SheetStatusBadge";
import { useDrawingDetail } from "./useDrawingDetail";
import { useDrawingCheckout } from "../checkout/hooks/useDrawingCheckout";
import { useDocumentActivityTrail } from "../checkout/hooks/useDocumentActivityTrail";
import { collapseDuplicateAllocated } from "../checkout/hooks/auditSentence";
import { useDrawingSheets } from "../approvals/hooks/useDrawingSheets";
import { useSheetCheckouts } from "../approvals/hooks/useSheetCheckouts";
import type { DrawingRow } from "./useSearchDrawings";

const DRAWING_PANEL_TOASTER_ID = "drawing-detail-toaster";

const useStyles = makeStyles({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  label: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: tokens.spacingVerticalS,
    "@media (min-width: 480px)": {
      gridTemplateColumns: "1fr 1fr",
      gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    },
  },
  divider: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    margin: `${tokens.spacingVerticalS} 0`,
  },
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
});

interface DrawingDetailPanelProps {
  drawing: DrawingRow | null;
  /** When set, flyout shows this child document — not the parent drawing summary. */
  selectedSheetId?: string;
  onClose: () => void;
}

export function DrawingDetailPanel({ drawing, selectedSheetId, onClose }: DrawingDetailPanelProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const appConfig = useAppConfig();
  const parentDrawingId = drawing?.id;
  const { data: detail, isPending: detailPending } = useDrawingDetail(parentDrawingId);
  const { data: sheets } = useDrawingSheets(parentDrawingId ?? "", !!parentDrawingId);
  const { data: checkoutMap } = useSheetCheckouts(parentDrawingId ?? "", !!parentDrawingId);
  const { data: activeCheckout } = useDrawingCheckout(selectedSheetId ? undefined : parentDrawingId);
  const sheetIds = useMemo(() => sheets?.map((s) => s.id) ?? [], [sheets]);
  const d = detail ?? drawing;
  const { data: rawAuditEvents = [] } = useDocumentActivityTrail(parentDrawingId, {
    // Sheet-focused view: parent drawing (one Allocated) + this sheet's lifecycle only.
    // Family view: parent + all sheets so check-out/in across children still appear.
    sheetIds: selectedSheetId ? undefined : sheetIds,
    focusedSheetId: selectedSheetId,
    reservationId: detail?.reservationId ?? (drawing as DrawingRow | null)?.reservationId,
    drawingCreatedOn: detail?.createdOn ?? (drawing as DrawingRow | null)?.createdOn,
    allocatedByName:
      detail?.approvedByName
      || detail?.submittedByName
      || (drawing as DrawingRow | null)?.approvedByName
      || (drawing as DrawingRow | null)?.submittedByName,
  });
  const auditEvents = useMemo(
    () => collapseDuplicateAllocated(rawAuditEvents),
    [rawAuditEvents],
  );
  const matchedSheet = selectedSheetId
    ? sheets?.find((s) => s.id === selectedSheetId)
    : undefined;
  const showsChildItems = hasChildItems(d);
  const childNounPlural = reservationChildNounPluralLower(d?.enmax_acdnreservationtype, d?.enmax_acdndocumentsubtype);
  const checkoutEnabled = isCheckoutEnabledForTaxonomy(
    appConfig,
    d?.enmax_acdnreservationtype,
    d?.enmax_acdndocumentsubtype,
  );

  const displayNumber = documentDisplayNumber(
    d?.enmax_acdnnumber,
    matchedSheet?.sheetNumber,
    d?.enmax_acdnreservationtype,
    d?.enmax_acdndocumentsubtype,
  ) || drawing?.enmax_acdnnumber || "Document";

  const standardDocument = recordCarriesSharePointPdf(
    d?.enmax_acdnreservationtype,
    d?.enmax_acdndocumentsubtype,
    { isChildSheet: !!matchedSheet },
  );
  const spResolved = resolveSharePointFileUrls({
    reservationType: d?.enmax_acdnreservationtype,
    documentSubtype: d?.enmax_acdndocumentsubtype,
    isChildSheet: !!matchedSheet,
    sheetDropOffUrl: matchedSheet?.sharepointUrl,
    sheetDestinationUrl: matchedSheet?.destinationUrl,
    drawingDropOffUrl: d?.enmax_acdnsplibraryurl,
    drawingDestinationUrl: d?.enmax_acdnspdestinationurl,
  });
  const sheetCheckout = matchedSheet ? checkoutMap?.get(matchedSheet.id) : undefined;
  const spFileUrl = sharePointFileUrl(spResolved.dropOffUrl, spResolved.destinationUrl, {
    preferDropOff: preferSharePointDropOff({
      sheetState: matchedSheet?.state,
      checkoutStatus: sheetCheckout?.status,
      drawingState: d?.enmax_acdnstate ?? drawing?.enmax_acdnstate,
    }),
  });

  const secondaryTitle = matchedSheet?.filename
    || (d?.enmax_acdntitle && d.enmax_acdntitle !== displayNumber ? d.enmax_acdntitle : "");
  const showSecondaryTitle = Boolean(secondaryTitle);

  const stateLabel = matchedSheet
    ? undefined
    : (DRAWING_STATE_LABELS[d?.enmax_acdnstate ?? drawing?.enmax_acdnstate ?? 0]
      ?? String(d?.enmax_acdnstate ?? ""));

  function viewAllRelated() {
    if (!parentDrawingId) return;
    const returnTo = `${location.pathname}${location.search}`;
    navigate(buildDrawingFamilyPageUrl({ drawingId: parentDrawingId, returnTo }));
    onClose();
  }

  return (
    <Drawer
      open={!!drawing}
      onOpenChange={(_, data) => !data.open && onClose()}
      position="end"
      size="large"
      aria-label="Document details"
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label="Close" />
          }
        >
          {displayNumber}
        </DrawerHeaderTitle>
      </DrawerHeader>

      <DrawerBody>
        <Toaster toasterId={DRAWING_PANEL_TOASTER_ID} />
        {!drawing && <Spinner label="Loading…" />}
        {drawing && (
          <div className={styles.body}>
            <div className={styles.section}>
              {showSecondaryTitle && (
                <Text weight="semibold" size={500}>
                  {secondaryTitle}
                </Text>
              )}
              {matchedSheet && (
                <Text size={200} className={styles.label}>
                  Parent record: {d?.enmax_acdnnumber}
                </Text>
              )}
              {standardDocument && spFileUrl && (
                <Link href={spFileUrl} target="_blank" rel="noopener noreferrer">
                  Open in SharePoint <OpenRegular style={{ verticalAlign: "middle" }} />
                </Link>
              )}
            </div>

            {showsChildItems && parentDrawingId && (
              <Button
                appearance="secondary"
                icon={<Table24Regular />}
                onClick={viewAllRelated}
              >
                View all related {childNounPlural}
              </Button>
            )}

            <div className={styles.divider} />

            {detailPending && !detail && <Spinner size="tiny" label="Loading details…" />}

            <div className={styles.metaGrid}>
              <MetaField label="Type">
                <DocumentTypeBadge label={d?.typeLabel ?? drawing.typeLabel} />
              </MetaField>
              {matchedSheet ? (
                <MetaField label="Status">
                  <SheetStatusBadge sheetState={matchedSheet.state} checkout={sheetCheckout} />
                </MetaField>
              ) : (
                <MetaField label="State">
                  <Badge
                    appearance="filled"
                    color={DRAWING_STATE_BADGE_COLOR[d?.enmax_acdnstate ?? 0] ?? "subtle"}
                    shape="rounded"
                  >
                    {stateLabel}
                  </Badge>
                </MetaField>
              )}
              <MetaField label="Last Check In" value={d?.enmax_acdnrevisiondate ? new Date(d.enmax_acdnrevisiondate).toLocaleDateString() : ""} />
              <MetaField label="Sheets" value={showsChildItems ? String(d?.enmax_acdnsheetcount ?? "—") : "—"} />
              <MetaField label="Business" value={d?.businessDisplay ?? ""} />
              <MetaField label="Asset" value={d?.assetDisplay ?? ""} />
              <MetaField label="Unit" value={d?.unitDisplay ?? ""} />
              <MetaField label="Domain" value={d?.domainDisplay ?? ""} />
              <MetaField label="System" value={d?.systemDisplay ?? ""} />
              <MetaField label="Kind" value={d?.kindDisplay ?? ""} />
              <MetaField label="Record Type" value={d?.recordTypeDisplay ?? ""} />
              <MetaField label="Record Phase" value={d?.recordPhaseDisplay ?? ""} />
              <MetaField label="Vendor" value={d?.vendorDisplay ?? ""} />
              <MetaField label="Requester" value={d?.requesterDisplay ?? ""} />
            </div>

            <div className={styles.divider} />

            <div className={styles.actions}>
              {matchedSheet && parentDrawingId ? (
                <SheetDocumentActions
                  drawingId={parentDrawingId}
                  sheetId={matchedSheet.id}
                  displayNumber={displayNumber}
                  sheetState={matchedSheet.state}
                  checkout={sheetCheckout}
                  checkoutEnabled={checkoutEnabled}
                  reservationType={d?.enmax_acdnreservationtype}
                  documentSubtype={d?.enmax_acdndocumentsubtype}
                  toasterId={DRAWING_PANEL_TOASTER_ID}
                />
              ) : (
                !showsChildItems && drawing && d && (
                  <DrawingActionsPanel
                    drawing={{
                      id: d.id,
                      state: d.enmax_acdnstate as DrawingStateValue,
                      number: d.enmax_acdnnumber,
                      currentRevision: d.enmax_acdncurrentrevision,
                      spLibraryUrl: d.enmax_acdnsplibraryurl,
                      reservationType: d.enmax_acdnreservationtype,
                      documentSubtype: d.enmax_acdndocumentsubtype,
                    }}
                    openCheckout={activeCheckout}
                    checkoutEnabled={checkoutEnabled}
                  />
                )
              )}
            </div>

            <div className={styles.divider} />

            <DocumentActivityTimeline
              events={auditEvents}
              reservationType={d?.enmax_acdnreservationtype}
              documentSubtype={d?.enmax_acdndocumentsubtype}
              title={matchedSheet ? "Document activity" : "Activity"}
              compact
            />
          </div>
        )}
      </DrawerBody>
    </Drawer>
  );
}

function hasChildItems(d?: DrawingRow | null): boolean {
  if (!d) return true;
  return reservationHasChildItems(d.enmax_acdnreservationtype, d.enmax_acdndocumentsubtype);
}

function MetaField({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <div>
      <Text className={styles.label} block>{label}</Text>
      {children ?? <Text block>{value || "—"}</Text>}
    </div>
  );
}
