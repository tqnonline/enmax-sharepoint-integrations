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
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  DismissRegular,
  OpenRegular,
} from "@fluentui/react-icons";
import { DrawingActionsPanel } from "../checkout/components/DrawingActionsPanel";
import { DrawingSheetList } from "../checkout/components/DrawingSheetList";
import type { DrawingStateValue } from "../checkout/api/checkoutClient";
import { useDrawingCheckout } from "../checkout/hooks/useDrawingCheckout";
import { useDrawingAuditTrail } from "../checkout/hooks/useDrawingAuditTrail";
import { SharePointLinkStatus } from "../sharepoint/SharePointLinkStatus";
import { formatAuditSentence } from "../checkout/hooks/auditSentence";
import { auditEventColor } from "../audit/auditPills";
import { useDrawingDetail } from "./useDrawingDetail";
import { DRAWING_STATE_LABELS, type DrawingRow } from "./useSearchDrawings";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
  documentDisplayNumber,
  reservationChildNoun,
} from "../reserve/terminology";
import { useAppConfig } from "../../config/useAppConfig";
import { isCheckoutEnabledForTaxonomy } from "../../config/checkoutTaxonomyConfig";
import {
  recordCarriesSharePointPdf,
  resolveSharePointFileUrls,
  sharePointFileUrl,
} from "../sharepoint/sharepointUrls";
import {
  Toaster,
} from "@fluentui/react-components";

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
    gridTemplateColumns: "1fr 1fr",
    gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
  },
  divider: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    margin: `${tokens.spacingVerticalS} 0`,
  },
  timeline: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  timelineItem: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    paddingLeft: tokens.spacingHorizontalS,
    borderLeft: `2px solid ${tokens.colorNeutralStroke1}`,
  },
  timelineMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  sheetList: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  sheetRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXXS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  sheetNumber: {
    minWidth: "120px",
    flexShrink: 0,
  },
  filename: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: tokens.colorNeutralForeground2,
  },
});

interface DrawingDetailPanelProps {
  drawing: DrawingRow | null;
  onClose: () => void;
}

export function DrawingDetailPanel({ drawing, onClose }: DrawingDetailPanelProps) {
  const styles = useStyles();
  const appConfig = useAppConfig();
  const { data: detail, isPending: detailPending } = useDrawingDetail(drawing?.id);
  const { data: activeCheckout } = useDrawingCheckout(drawing?.id);
  const { data: auditEvents = [] } = useDrawingAuditTrail(drawing?.id);

  const d = detail ?? drawing;
  const showsChildItems = hasChildItems(d);
  const childNoun = reservationChildNoun(d?.enmax_acdnreservationtype, d?.enmax_acdndocumentsubtype);
  const checkoutEnabled = isCheckoutEnabledForTaxonomy(
    appConfig,
    d?.enmax_acdnreservationtype,
    d?.enmax_acdndocumentsubtype,
  );
  const standardDocument = recordCarriesSharePointPdf(
    d?.enmax_acdnreservationtype,
    d?.enmax_acdndocumentsubtype,
    { isChildSheet: false },
  );
  const spResolved = resolveSharePointFileUrls({
    reservationType: d?.enmax_acdnreservationtype,
    documentSubtype: d?.enmax_acdndocumentsubtype,
    isChildSheet: false,
    drawingDropOffUrl: d?.enmax_acdnsplibraryurl,
    drawingDestinationUrl: d?.enmax_acdnspdestinationurl,
  });
  const spFileUrl = sharePointFileUrl(spResolved.dropOffUrl, spResolved.destinationUrl);

  const drawingForPanel = d
    ? {
        id:              d.id,
        state:           d.enmax_acdnstate as DrawingStateValue,
        number:          d.enmax_acdnnumber,
        currentRevision: d.enmax_acdncurrentrevision,
        spLibraryUrl:    d.enmax_acdnsplibraryurl,
      }
    : undefined;

  return (
    <Drawer
      open={!!drawing}
      onOpenChange={(_, d) => !d.open && onClose()}
      position="end"
      size="medium"
      aria-label="Drawing details"
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label="Close" />
          }
        >
          {documentDisplayNumber(
            drawing?.enmax_acdnnumber,
            undefined,
            d?.enmax_acdnreservationtype,
            d?.enmax_acdndocumentsubtype,
          ) || "Drawing"}
        </DrawerHeaderTitle>
      </DrawerHeader>

      <DrawerBody>
        <Toaster toasterId={DRAWING_PANEL_TOASTER_ID} />
        {!drawing && <Spinner label="Loading…" />}
        {drawing && (
          <div className={styles.body}>
            <div className={styles.section}>
              <Text weight="semibold" size={500}>{d?.enmax_acdntitle}</Text>
              {standardDocument && spFileUrl && (
                <Link href={spFileUrl} target="_blank" rel="noopener noreferrer">
                  Open in SharePoint <OpenRegular style={{ verticalAlign: "middle" }} />
                </Link>
              )}
              {standardDocument && (
                <SharePointLinkStatus
                  presentInDropOff={d?.enmax_acdnpresentindropoff}
                  presentInDestination={d?.enmax_acdnpresentindestination}
                  recordNumber={documentDisplayNumber(
                    d?.enmax_acdnnumber,
                    undefined,
                    d?.enmax_acdnreservationtype,
                    d?.enmax_acdndocumentsubtype,
                  )}
                />
              )}
            </div>

            <div className={styles.divider} />

            {detailPending && !detail && <Spinner size="tiny" label="Loading details…" />}

            <div className={styles.metaGrid}>
              <MetaField label="Type" value={d?.typeLabel ?? drawing.typeLabel} />
              <MetaField label="State" value={DRAWING_STATE_LABELS[d?.enmax_acdnstate ?? drawing.enmax_acdnstate] ?? String(d?.enmax_acdnstate)} />
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

            {showsChildItems && drawing?.id && (
              <>
                <div className={styles.divider} />
                <div className={styles.section}>
                  <Text weight="semibold" size={300}>{childNoun}s</Text>
                  <DrawingSheetList
                    drawingId={drawing.id}
                    baseNumber={d?.enmax_acdnnumber}
                    reservationType={d?.enmax_acdnreservationtype}
                    documentSubtype={d?.enmax_acdndocumentsubtype}
                    checkoutEnabled={checkoutEnabled}
                    childNoun={childNoun}
                    toasterId={DRAWING_PANEL_TOASTER_ID}
                  />
                </div>
              </>
            )}

            <div className={styles.divider} />

            {!showsChildItems && (
              <div className={styles.section}>
                <Text weight="semibold" size={300}>Actions</Text>
                {drawingForPanel && (
                  <DrawingActionsPanel
                    drawing={drawingForPanel}
                    openCheckout={activeCheckout}
                  />
                )}
              </div>
            )}

            {showsChildItems && activeCheckout && (
              <div className={styles.section}>
                <Text weight="semibold" size={300}>Check In</Text>
                {drawingForPanel && (
                  <DrawingActionsPanel
                    drawing={drawingForPanel}
                    openCheckout={activeCheckout}
                  />
                )}
              </div>
            )}

            {auditEvents.length > 0 && (
              <>
                <div className={styles.divider} />
                <div className={styles.section}>
                  <Text weight="semibold" size={300}>Activity</Text>
                  <div className={styles.timeline}>
                    {auditEvents.map(ev => (
                      <div key={ev.id} className={styles.timelineItem}>
                        <Text size={200} weight="semibold">
                          <Badge appearance="filled" color={auditEventColor(ev.event)} size="small">{ev.eventLabel}</Badge>
                        </Text>
                        <Text size={200}>
                          {formatAuditSentence(ev, {
                            reservationType: d?.enmax_acdnreservationtype,
                            documentSubtype: d?.enmax_acdndocumentsubtype,
                          })}
                        </Text>
                        {ev.reason && (
                          <Text size={200} className={styles.timelineMeta}>{ev.reason}</Text>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </DrawerBody>
    </Drawer>
  );
}

function hasChildItems(d?: DrawingRow | null): boolean {
  if (!d) return true;
  if (d.enmax_acdnreservationtype === RESERVATION_TYPE_VALUE.Document) {
    return d.enmax_acdndocumentsubtype === DOCUMENT_SUBTYPE_VALUE.Procedure;
  }
  return true;
}

function MetaField({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <div>
      <Text className={styles.label} block>{label}</Text>
      <Text block>{value || "—"}</Text>
    </div>
  );
}
