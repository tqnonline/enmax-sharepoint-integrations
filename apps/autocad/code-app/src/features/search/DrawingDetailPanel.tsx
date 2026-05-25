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
import { DismissRegular, OpenRegular } from "@fluentui/react-icons";
import { DrawingActionsPanel } from "../checkout/components/DrawingActionsPanel";
import type { DrawingStateValue } from "../checkout/api/checkoutClient";
import { useDrawingCheckout } from "../checkout/hooks/useDrawingCheckout";
import { useDrawingAuditTrail } from "../checkout/hooks/useDrawingAuditTrail";
import { formatAuditSentence } from "../checkout/hooks/auditSentence";
import { auditEventColor } from "../audit/auditPills";
import { useDrawingDetail } from "./useDrawingDetail";
import { DRAWING_STATE_LABELS, type DrawingRow } from "./useSearchDrawings";

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
});

interface DrawingDetailPanelProps {
  drawing: DrawingRow | null;
  onClose: () => void;
}

export function DrawingDetailPanel({ drawing, onClose }: DrawingDetailPanelProps) {
  const styles = useStyles();
  const { data: detail, isPending: detailPending } = useDrawingDetail(drawing?.id);
  const { data: activeCheckout } = useDrawingCheckout(drawing?.id);
  const { data: auditEvents = [] } = useDrawingAuditTrail(drawing?.id);

  const d = detail ?? drawing;

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
          {drawing?.enmax_acdnnumber ?? "Drawing"}
        </DrawerHeaderTitle>
      </DrawerHeader>

      <DrawerBody>
        {!drawing && <Spinner label="Loading…" />}
        {drawing && (
          <div className={styles.body}>
            <div className={styles.section}>
              <Text weight="semibold" size={500}>{d?.enmax_acdntitle}</Text>
              {d?.enmax_acdnsplibraryurl && (
                <Link href={d.enmax_acdnsplibraryurl} target="_blank" rel="noopener noreferrer">
                  Open in SharePoint <OpenRegular style={{ verticalAlign: "middle" }} />
                </Link>
              )}
            </div>

            <div className={styles.divider} />

            {detailPending && !detail && <Spinner size="tiny" label="Loading details…" />}

            <div className={styles.metaGrid}>
              <MetaField label="State" value={DRAWING_STATE_LABELS[d?.enmax_acdnstate ?? drawing.enmax_acdnstate] ?? String(d?.enmax_acdnstate)} />
              <MetaField label="Current Revision" value={d?.enmax_acdncurrentrevision ?? ""} />
              <MetaField label="Revision Date" value={d?.enmax_acdnrevisiondate ? new Date(d.enmax_acdnrevisiondate).toLocaleDateString() : ""} />
              <MetaField label="Sheets" value={String(d?.enmax_acdnsheetcount ?? "")} />
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

            <div className={styles.section}>
              <Text weight="semibold" size={300}>Actions</Text>
              {drawingForPanel && (
                <DrawingActionsPanel
                  drawing={drawingForPanel}
                  openCheckout={activeCheckout}
                />
              )}
            </div>

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
                        <Text size={200}>{formatAuditSentence(ev)}</Text>
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

function MetaField({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <div>
      <Text className={styles.label} block>{label}</Text>
      <Text block>{value || "—"}</Text>
    </div>
  );
}
