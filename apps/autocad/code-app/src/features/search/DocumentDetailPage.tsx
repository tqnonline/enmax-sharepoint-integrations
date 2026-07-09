import { useMemo } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  Link,
  Spinner,
  Text,
  Title2,
  Toaster,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { ArrowLeftRegular, OpenRegular } from "@fluentui/react-icons";
import { DrawingActionsPanel } from "../checkout/components/DrawingActionsPanel";
import type { DrawingStateValue } from "../checkout/api/checkoutClient";
import { useDrawingCheckout } from "../checkout/hooks/useDrawingCheckout";
import { useDrawingAuditTrail } from "../checkout/hooks/useDrawingAuditTrail";
import { SharePointLinkStatus } from "../sharepoint/SharePointLinkStatus";
import { formatAuditSentence } from "../checkout/hooks/auditSentence";
import { auditEventColor } from "../audit/auditPills";
import { useDrawingSheets, SHEET_STATE_LABELS } from "../approvals/hooks/useDrawingSheets";
import { DrawingSheetList } from "../checkout/components/DrawingSheetList";
import { useDrawingDetail } from "./useDrawingDetail";
import { DRAWING_STATE_LABELS } from "./useSearchDrawings";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
  documentDisplayNumber,
  reservationChildNoun,
  reservationHasChildItems,
} from "../reserve/terminology";
import { useAppConfig } from "../../config/useAppConfig";
import { isCheckoutEnabledForTaxonomy } from "../../config/checkoutTaxonomyConfig";
import {
  recordCarriesSharePointPdf,
  resolveSharePointFileUrls,
  sharePointFileUrl,
} from "../sharepoint/sharepointUrls";

const TOASTER_ID = "document-detail-toaster";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    gap: tokens.spacingVerticalM,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalM,
  },
  back: { flexShrink: 0, marginTop: "4px" },
  titleBlock: { flex: 1, minWidth: 0 },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXXS },
  scroll: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    paddingRight: tokens.spacingHorizontalXS,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: tokens.spacingHorizontalM,
  },
  label: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  divider: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  timeline: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  timelineItem: {
    paddingLeft: tokens.spacingHorizontalS,
    borderLeft: `2px solid ${tokens.colorNeutralStroke1}`,
  },
});

export function DocumentDetailPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const drawingId = searchParams.get("drawingId") ?? documentId ?? "";
  const tab = searchParams.get("tab") ?? "drawings";
  const returnTo =
    (location.state as { returnTo?: string } | null)?.returnTo
    ?? searchParams.get("returnTo")
    ?? `/search?tab=${tab}`;

  const appConfig = useAppConfig();
  const { data: detail, isPending: detailPending } = useDrawingDetail(drawingId);
  const { data: sheets, isPending: sheetsPending } = useDrawingSheets(drawingId, !!drawingId);
  const { data: activeCheckout } = useDrawingCheckout(drawingId);
  const { data: auditEvents = [] } = useDrawingAuditTrail(drawingId);

  const d = detail;
  const matchedSheet = documentId !== drawingId
    ? sheets?.find((s) => s.id === documentId)
    : undefined;

  const showsChildItems = hasChildItems(d);
  const childNoun = reservationChildNoun(d?.enmax_acdnreservationtype, d?.enmax_acdndocumentsubtype);
  const checkoutEnabled = isCheckoutEnabledForTaxonomy(
    appConfig,
    d?.enmax_acdnreservationtype,
    d?.enmax_acdndocumentsubtype,
  );

  const displayNumber = useMemo(() => {
    if (matchedSheet && d) {
      return documentDisplayNumber(
        d.enmax_acdnnumber,
        matchedSheet.sheetNumber,
        d.enmax_acdnreservationtype,
        d.enmax_acdndocumentsubtype,
      );
    }
    return documentDisplayNumber(
      d?.enmax_acdnnumber,
      undefined,
      d?.enmax_acdnreservationtype,
      d?.enmax_acdndocumentsubtype,
    );
  }, [matchedSheet, d]);

  const documentStateLabel = matchedSheet
    ? (SHEET_STATE_LABELS[matchedSheet.state ?? 0] ?? String(matchedSheet.state ?? ""))
    : (d ? DRAWING_STATE_LABELS[d.enmax_acdnstate] : "");

  const spResolved = resolveSharePointFileUrls({
    reservationType: d?.enmax_acdnreservationtype,
    documentSubtype: d?.enmax_acdndocumentsubtype,
    isChildSheet: !!matchedSheet,
    sheetDropOffUrl: matchedSheet?.sharepointUrl,
    sheetDestinationUrl: matchedSheet?.destinationUrl,
    drawingDropOffUrl: d?.enmax_acdnsplibraryurl,
    drawingDestinationUrl: d?.enmax_acdnspdestinationurl,
  });
  const spUrl = sharePointFileUrl(spResolved.dropOffUrl, spResolved.destinationUrl);
  const showSharePointStatus = recordCarriesSharePointPdf(
    d?.enmax_acdnreservationtype,
    d?.enmax_acdndocumentsubtype,
    { isChildSheet: !!matchedSheet },
  );

  const drawingForPanel = d
    ? {
        id: d.id,
        state: d.enmax_acdnstate as DrawingStateValue,
        number: d.enmax_acdnnumber,
        currentRevision: d.enmax_acdncurrentrevision,
        spLibraryUrl: d.enmax_acdnsplibraryurl,
      }
    : undefined;

  const isLoading = detailPending || sheetsPending;

  function goBack() {
    navigate(returnTo);
  }

  if (isLoading && !d) {
    return (
      <div className={styles.root}>
        <Spinner label="Loading document…" />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <Toaster toasterId={TOASTER_ID} />

      <div className={styles.header}>
        <Button
          className={styles.back}
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={goBack}
        >
          Back to search
        </Button>
        <div className={styles.titleBlock}>
          <Title2 as="h1">{displayNumber || "Document"}</Title2>
          <Text className={styles.subtitle} block>
            {matchedSheet?.filename || d?.enmax_acdntitle || "—"}
          </Text>
          {d && (
            <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
              <Badge appearance="tint" color="informative">{d.typeLabel}</Badge>
              {documentStateLabel && <Badge appearance="tint">{documentStateLabel}</Badge>}
            </div>
          )}
        </div>
        {spUrl && (
          <Link href={spUrl} target="_blank" rel="noopener noreferrer">
            Open in SharePoint <OpenRegular style={{ verticalAlign: "middle" }} />
          </Link>
        )}
      </div>

      <div className={styles.scroll}>
        {showSharePointStatus && (
          <div className={styles.section}>
            <SharePointLinkStatus
              presentInDropOff={matchedSheet?.presentInDropOff ?? d?.enmax_acdnpresentindropoff}
              presentInDestination={matchedSheet?.presentInDestination ?? d?.enmax_acdnpresentindestination}
              recordNumber={displayNumber}
            />
          </div>
        )}

        <div className={styles.metaGrid}>
          <MetaField label="Type" value={d?.typeLabel} />
          <MetaField label="State" value={documentStateLabel} />
          <MetaField label="Revision" value={d?.enmax_acdncurrentrevision} />
          <MetaField
            label="Revision date"
            value={d?.enmax_acdnrevisiondate ? new Date(d.enmax_acdnrevisiondate).toLocaleDateString() : ""}
          />
          <MetaField label="Business" value={d?.businessDisplay} />
          <MetaField label="Asset" value={d?.assetDisplay} />
          <MetaField label="Unit" value={d?.unitDisplay} />
          <MetaField label="Domain" value={d?.domainDisplay} />
          <MetaField label="System" value={d?.systemDisplay} />
          <MetaField label="Kind" value={d?.kindDisplay} />
          <MetaField label="Submitted by" value={d?.submittedByName} />
          <MetaField label="Approved by" value={d?.approvedByName} />
        </div>

        {showsChildItems && drawingId && (
          <>
            <div className={styles.divider} />
            <div className={styles.section}>
              <Text weight="semibold" size={400}>All {childNoun}s on this record</Text>
              <DrawingSheetList
                drawingId={drawingId}
                baseNumber={d?.enmax_acdnnumber}
                reservationType={d?.enmax_acdnreservationtype}
                documentSubtype={d?.enmax_acdndocumentsubtype}
                checkoutEnabled={checkoutEnabled}
                childNoun={childNoun}
                toasterId={TOASTER_ID}
              />
            </div>
          </>
        )}

        <div className={styles.divider} />

        {!showsChildItems && (
          <div className={styles.section}>
            <Text weight="semibold" size={400}>Actions</Text>
            {drawingForPanel && (
              <DrawingActionsPanel drawing={drawingForPanel} openCheckout={activeCheckout} />
            )}
          </div>
        )}

        {showsChildItems && activeCheckout && (
          <div className={styles.section}>
            <Text weight="semibold" size={400}>Check In</Text>
            {drawingForPanel && (
              <DrawingActionsPanel drawing={drawingForPanel} openCheckout={activeCheckout} />
            )}
          </div>
        )}

        {auditEvents.length > 0 && (
          <>
            <div className={styles.divider} />
            <div className={styles.section}>
              <Text weight="semibold" size={400}>Activity</Text>
              <div className={styles.timeline}>
                {auditEvents.map((ev) => (
                  <div key={ev.id} className={styles.timelineItem}>
                    <Badge appearance="filled" color={auditEventColor(ev.event)} size="small">
                      {ev.eventLabel}
                    </Badge>
                    <Text size={200}>
                      {formatAuditSentence(ev, {
                        reservationType: d?.enmax_acdnreservationtype,
                        documentSubtype: d?.enmax_acdndocumentsubtype,
                      })}
                    </Text>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function hasChildItems(d?: { enmax_acdnreservationtype?: number; enmax_acdndocumentsubtype?: number } | null): boolean {
  if (!d) return true;
  if (d.enmax_acdnreservationtype === RESERVATION_TYPE_VALUE.Document) {
    return d.enmax_acdndocumentsubtype === DOCUMENT_SUBTYPE_VALUE.Procedure;
  }
  return reservationHasChildItems(d.enmax_acdnreservationtype, d.enmax_acdndocumentsubtype);
}

function MetaField({ label, value }: { label: string; value?: string }) {
  const styles = useStyles();
  return (
    <div>
      <Text className={styles.label} block>{label}</Text>
      <Text block>{value || "—"}</Text>
    </div>
  );
}
