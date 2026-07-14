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
import {
  type DrawingStateValue,
  DRAWING_STATE_BADGE_COLOR,
  DRAWING_STATE_LABELS,
} from "../checkout/api/checkoutClient";
import { useDrawingCheckout } from "../checkout/hooks/useDrawingCheckout";
import { useDocumentActivityTrail } from "../checkout/hooks/useDocumentActivityTrail";
import { SharePointLinkStatus } from "../sharepoint/SharePointLinkStatus";
import { useDrawingSheets, SHEET_STATE_LABELS } from "../approvals/hooks/useDrawingSheets";
import { useSheetCheckouts } from "../approvals/hooks/useSheetCheckouts";
import { DrawingSheetList } from "../checkout/components/DrawingSheetList";
import { SheetDocumentActions } from "../checkout/components/SheetDocumentActions";
import { useDrawingDetail } from "./useDrawingDetail";
import {
  documentDisplayNumber,
  reservationChildNoun,
  reservationChildNounPluralLower,
  reservationChildNounSingularLower,
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
import { buildDocumentDetailUrl, buildDrawingFamilyPageUrl } from "./searchUrlState";
import { DocumentActivityTimeline } from "./DocumentActivityTimeline";
import { SheetStatusBadge } from "../checkout/components/SheetStatusBadge";

const TOASTER_ID = "document-detail-toaster";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minHeight: "100%",
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalL,
    flexWrap: "wrap",
  },
  back: { flexShrink: 0, marginTop: "4px" },
  titleBlock: { flex: 1, minWidth: "min(100%, 280px)" },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXXS },
  badgeRow: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
    flexWrap: "wrap",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: tokens.spacingVerticalL,
    "@media (min-width: 1280px)": {
      gridTemplateColumns: "minmax(280px, 360px) 1fr",
      alignItems: "start",
    },
  },
  sidePanel: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  mainPanel: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    minWidth: 0,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: tokens.spacingHorizontalM,
  },
  label: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  divider: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  gridSection: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
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
  const { data: checkoutMap } = useSheetCheckouts(drawingId, !!drawingId);
  const { data: activeCheckout } = useDrawingCheckout(drawingId);

  const d = detail;
  const matchedSheet = documentId !== drawingId
    ? sheets?.find((s) => s.id === documentId)
    : undefined;

  const { data: auditEvents = [] } = useDocumentActivityTrail(drawingId, {
    sheetIds: matchedSheet ? undefined : (sheets?.map((s) => s.id) ?? []),
    focusedSheetId: matchedSheet?.id,
  });

  const isFamilyView = !matchedSheet && documentId === drawingId;

  const showsChildItems = hasChildItems(d);
  const childNoun = reservationChildNoun(d?.enmax_acdnreservationtype, d?.enmax_acdndocumentsubtype);
  const childNounPlural = reservationChildNounPluralLower(d?.enmax_acdnreservationtype, d?.enmax_acdndocumentsubtype);
  const childNounSingular = reservationChildNounSingularLower(d?.enmax_acdnreservationtype, d?.enmax_acdndocumentsubtype);
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

  const sheetCheckout = matchedSheet ? checkoutMap?.get(matchedSheet.id) : undefined;

  const spResolved = resolveSharePointFileUrls({
    reservationType: d?.enmax_acdnreservationtype,
    documentSubtype: d?.enmax_acdndocumentsubtype,
    isChildSheet: !!matchedSheet,
    sheetDropOffUrl: matchedSheet?.sharepointUrl,
    sheetDestinationUrl: matchedSheet?.destinationUrl,
    drawingDropOffUrl: d?.enmax_acdnsplibraryurl,
    drawingDestinationUrl: d?.enmax_acdnspdestinationurl,
  });
  const spUrl = sharePointFileUrl(spResolved.dropOffUrl, spResolved.destinationUrl, {
    preferDropOff: preferSharePointDropOff({
      sheetState: matchedSheet?.state,
      checkoutStatus: sheetCheckout?.status,
      drawingState: d?.enmax_acdnstate,
    }),
  });
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
        reservationType: d.enmax_acdnreservationtype,
        documentSubtype: d.enmax_acdndocumentsubtype,
      }
    : undefined;

  const isLoading = detailPending || sheetsPending;

  const pageSubtitle = useMemo(() => {
    const candidate = matchedSheet?.filename
      || (d?.enmax_acdntitle && d.enmax_acdntitle !== displayNumber ? d.enmax_acdntitle : "");
    return candidate || "";
  }, [matchedSheet?.filename, d?.enmax_acdntitle, displayNumber]);

  function goBack() {
    navigate(returnTo);
  }

  function openSheetDetail(sheetId: string) {
    navigate(buildDocumentDetailUrl({
      documentId: sheetId,
      drawingId,
      tab: tab as "drawings" | "documents",
      returnTo,
    }));
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
          Back
        </Button>
        <div className={styles.titleBlock}>
          <Title2 as="h1">{displayNumber || "Document"}</Title2>
          {pageSubtitle && (
            <Text className={styles.subtitle} block>
              {pageSubtitle}
            </Text>
          )}
          {d && (
            <div className={styles.badgeRow}>
              <Badge appearance="filled" color="brand">{d.typeLabel}</Badge>
              {matchedSheet ? (
                <SheetStatusBadge sheetState={matchedSheet.state} checkout={sheetCheckout} />
              ) : documentStateLabel ? (
                <Badge
                  appearance="filled"
                  color={DRAWING_STATE_BADGE_COLOR[d.enmax_acdnstate] ?? "subtle"}
                  shape="rounded"
                >
                  {documentStateLabel}
                </Badge>
              ) : null}
            </div>
          )}
        </div>
        {spUrl && (
          <Link href={spUrl} target="_blank" rel="noopener noreferrer">
            Open in SharePoint <OpenRegular style={{ verticalAlign: "middle" }} />
          </Link>
        )}
      </div>

      <div className={styles.layout}>
        <aside className={styles.sidePanel}>
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
            <MetaField label="Business" value={d?.businessDisplay} />
            <MetaField label="Asset" value={d?.assetDisplay} />
            <MetaField label="Unit" value={d?.unitDisplay} />
            <MetaField label="Domain" value={d?.domainDisplay} />
            <MetaField label="System" value={d?.systemDisplay} />
            <MetaField label="Kind" value={d?.kindDisplay} />
            <MetaField label="Revision" value={d?.enmax_acdncurrentrevision} />
            <MetaField
              label="Revision date"
              value={d?.enmax_acdnrevisiondate ? new Date(d.enmax_acdnrevisiondate).toLocaleDateString() : ""}
            />
            <MetaField label="Submitted By" value={d?.submittedByName} />
            <MetaField label="Approved By" value={d?.approvedByName} />
          </div>

          {matchedSheet && drawingId && (
            <SheetDocumentActions
              drawingId={drawingId}
              sheetId={matchedSheet.id}
              displayNumber={displayNumber}
              sheetState={matchedSheet.state}
              checkout={sheetCheckout}
              checkoutEnabled={checkoutEnabled}
              reservationType={d?.enmax_acdnreservationtype}
              documentSubtype={d?.enmax_acdndocumentsubtype}
              toasterId={TOASTER_ID}
            />
          )}

          {!showsChildItems && drawingForPanel && (
            <div className={styles.section}>
              <Text weight="semibold" size={400}>Actions</Text>
              <DrawingActionsPanel drawing={drawingForPanel} openCheckout={activeCheckout} />
            </div>
          )}

          <DocumentActivityTimeline
            events={auditEvents}
            reservationType={d?.enmax_acdnreservationtype}
            documentSubtype={d?.enmax_acdndocumentsubtype}
            title={matchedSheet ? "Document activity" : "Activity"}
          />
        </aside>

        <div className={styles.mainPanel}>
          {showsChildItems && drawingId && isFamilyView && (
            <div className={styles.gridSection}>
              <Text weight="semibold" size={500}>
                All {childNounPlural} for {d?.enmax_acdnnumber}
              </Text>
              <DrawingSheetList
                drawingId={drawingId}
                baseNumber={d?.enmax_acdnnumber}
                reservationType={d?.enmax_acdnreservationtype}
                documentSubtype={d?.enmax_acdndocumentsubtype}
                checkoutEnabled={checkoutEnabled}
                childNoun={childNoun}
                toasterId={TOASTER_ID}
                variant="full"
                showPerRowActivity
                onSheetClick={openSheetDetail}
              />
            </div>
          )}

          {matchedSheet && showsChildItems && (
            <div className={styles.section}>
              <Text size={200} className={styles.label}>
                This is one {childNounSingular} from {d?.enmax_acdnnumber}. Open the family page to see and manage all related {childNounPlural}.
              </Text>
              <Button
                appearance="secondary"
                onClick={() => navigate(buildDrawingFamilyPageUrl({ drawingId, returnTo }))}
              >
                View all related {childNounPlural}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function hasChildItems(d?: { enmax_acdnreservationtype?: number; enmax_acdndocumentsubtype?: number } | null): boolean {
  if (!d) return true;
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
