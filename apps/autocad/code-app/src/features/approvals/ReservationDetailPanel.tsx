import { useState, useEffect } from "react";
import {
  OverlayDrawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Button,
  Text,
  Badge,
  Divider,
  Persona,
  Spinner,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { Dismiss24Regular, Warning24Regular, ArrowSquareUpRightRegular } from "@fluentui/react-icons";
import type { PendingReservation } from "./hooks/usePendingReservations";
import { formatComposition, formatNumberRange } from "./compositionUtils";
import { useApproveReservation } from "./hooks/useApproveReservation";
import { useApprovalAudit } from "./hooks/useApprovalAudit";
import { DeclineDialog } from "./DeclineDialog";
import { useCurrentUser } from "../../auth/useCurrentUser";

function formatAuditLabel(event: number, formatted: string): string {
  const map: Record<number, string> = { 1: "Submitted", 3: "Approval Granted", 4: "Approval Denied" };
  return map[event] ?? formatted.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function auditDotColor(event: number): string {
  if (event === 3) return tokens.colorPaletteGreenForeground2;
  if (event === 4) return tokens.colorPaletteRedForeground1;
  return tokens.colorBrandForeground1;
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
  field: {
    display: "grid",
    gridTemplateColumns: "130px 1fr",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalS,
    alignItems: "start",
    "@media (max-width: 480px)": {
      gridTemplateColumns: "1fr",
      gap: tokens.spacingVerticalXS,
    },
  },
  label: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    paddingTop: "4px",
    "@media (max-width: 480px)": { paddingTop: 0 },
  },
  actions: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalL,
    flexWrap: "wrap",
  },
  auditSection: { marginTop: tokens.spacingVerticalXL },
  timeline: { marginTop: tokens.spacingVerticalS },
  timelineItem: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
  },
  timelineTrack: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "14px",
    flexShrink: 0,
  },
  timelineDot: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    flexShrink: 0,
    marginTop: "3px",
    border: `2px solid ${tokens.colorNeutralBackground1}`,
    boxSizing: "border-box",
  },
  timelineConnector: {
    flex: 1,
    width: "2px",
    minHeight: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralStroke2,
    marginTop: "2px",
  },
  timelineContent: {
    flex: 1,
    paddingBottom: tokens.spacingVerticalL,
  },
  timelineLabel: {
    display: "block",
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalXS,
  },
  timelineMeta: {
    color: tokens.colorNeutralForeground3,
    display: "block",
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    display: "block",
    marginTop: tokens.spacingVerticalS,
  },
});

interface Props {
  reservation: PendingReservation | null;
  onClose: () => void;
  readonly?: boolean;
  onApproved?: (reservationNumber: string) => void;
  onDeclined?: (reservationNumber: string) => void;
}

export function ReservationDetailPanel({ reservation, onClose, readonly = false, onApproved, onDeclined }: Props) {
  const styles = useStyles();
  const [declineOpen, setDeclineOpen] = useState(false);
  const screenWidth = useScreenWidth();
  const approveMutation = useApproveReservation();
  const auditQuery = useApprovalAudit(reservation?.enmax_acdnreservationid ?? null);
  const { data: currentUser } = useCurrentUser();

  // "small" = 320px at tablet portrait; "medium" = 592px at desktop/landscape
  const drawerSize = screenWidth >= 1024 ? "medium" : "small";

  function handleApprove() {
    if (!reservation) return;
    const num = reservation.enmax_acdnreservationnumber;
    approveMutation.mutate(
      {
        reservationId: reservation.enmax_acdnreservationid,
        decision:      "Approved",
        businessCode:  reservation.businessCode,
        assetCode:     reservation.assetCode,
        unitCode:      reservation.unitCode,
        domainCode:    reservation.domainCode,
        systemCode:    reservation.systemCode,
        kindCode:      reservation.kindCode,
        drawingCount:  reservation.enmax_acdndrawingcount,
      },
      { onSuccess: () => { onClose(); onApproved?.(num); } },
    );
  }

  function handleDecline(reason: string) {
    if (!reservation) return;
    const num = reservation.enmax_acdnreservationnumber;
    approveMutation.mutate(
      { reservationId: reservation.enmax_acdnreservationid, decision: "Declined", reason },
      { onSuccess: () => { setDeclineOpen(false); onClose(); onDeclined?.(num); } },
    );
  }

  const compositionPreview = reservation ? formatComposition(reservation) : "";

  return (
    <>
      <OverlayDrawer
        open={!!reservation}
        onOpenChange={(_, data) => { if (!data.open) onClose(); }}
        position="end"
        size={drawerSize}
        modalType="non-modal"
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <div style={{ display: "flex", gap: "4px" }}>
                {reservation && currentUser && (
                  <Button
                    appearance="subtle"
                    icon={<ArrowSquareUpRightRegular />}
                    onClick={() => {
                      const { appId, environmentId, tenantId } = currentUser;
                      window.open(
                        `https://apps.powerapps.com/play/e/${environmentId}/app/${appId}?tenantId=${tenantId}#/reservations/${reservation.enmax_acdnreservationid}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                    aria-label="Open in new tab"
                  />
                )}
                <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} aria-label="Close panel" />
              </div>
            }
          >
            {reservation?.enmax_acdnreservationnumber ?? "Reservation"}
          </DrawerHeaderTitle>
        </DrawerHeader>

        <DrawerBody>
          {reservation && (
            <>
              {reservation.enmax_acdnoverride && (
                <Badge
                  icon={<Warning24Regular />}
                  color="warning"
                  style={{ marginBottom: tokens.spacingVerticalM }}
                >
                  Validation override
                </Badge>
              )}

              <div style={{ marginBottom: tokens.spacingVerticalM }}>
                <Persona
                  name={reservation._createdby_value_Formatted}
                  secondaryText={reservation.createdByJobTitle || ""}
                  size="medium"
                />
              </div>

              <Divider style={{ marginBottom: tokens.spacingVerticalM }} />

              <div className={styles.field}>
                <span className={styles.label}>Drawing/Document Number</span>
                <Text
                  style={{ fontFamily: "monospace", overflowWrap: "break-word", wordBreak: "break-all" }}
                >
                  {compositionPreview}
                </Text>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Drawings</span>
                <span>{reservation.enmax_acdndrawingcount}</span>
              </div>
              {reservation.enmax_acdnissuednumbers && (
                <div className={styles.field}>
                  <span className={styles.label}>Issued numbers</span>
                  <span style={{ fontFamily: "monospace" }}>
                    {formatNumberRange(reservation.enmax_acdnissuednumbers)}
                  </span>
                </div>
              )}
              <div className={styles.field}>
                <span className={styles.label}>Reason</span>
                <span>{reservation.enmax_acdnreason}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Submitted</span>
                <span>{new Date(reservation.createdon).toLocaleString()}</span>
              </div>

              {reservation.enmax_acdndeclinereason && (
                <div className={styles.field}>
                  <span className={styles.label}>Decline reason</span>
                  <span>{reservation.enmax_acdndeclinereason}</span>
                </div>
              )}

              {approveMutation.isError && (
                <Text className={styles.errorText}>
                  Action failed: {approveMutation.error?.message}
                </Text>
              )}

              <div className={styles.actions}>
                {!readonly && (
                  <>
                    <Button
                      appearance="primary"
                      onClick={handleApprove}
                      disabled={approveMutation.isPending}
                    >
                      {approveMutation.isPending ? <Spinner size="tiny" /> : "Approve"}
                    </Button>
                    <Button
                      appearance="secondary"
                      onClick={() => setDeclineOpen(true)}
                      disabled={approveMutation.isPending}
                    >
                      Decline
                    </Button>
                  </>
                )}
              </div>

              <div className={styles.auditSection}>
                <Divider style={{ marginBottom: tokens.spacingVerticalM }} />
                <Text
                  weight="semibold"
                  size={300}
                  style={{ display: "block", marginBottom: tokens.spacingVerticalS }}
                >
                  Audit history
                </Text>

                {auditQuery.isPending && <Spinner size="tiny" label="Loading audit…" />}

                {!auditQuery.isPending && (auditQuery.data?.length ?? 0) === 0 && (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    No audit events yet.
                  </Text>
                )}

                <div className={styles.timeline}>
                  {auditQuery.data?.map((e, i) => {
                    const isLast = i === (auditQuery.data?.length ?? 0) - 1;
                    return (
                      <div key={e.enmax_acdnauditeventid} className={styles.timelineItem}>
                        <div className={styles.timelineTrack}>
                          <div
                            className={styles.timelineDot}
                            style={{ backgroundColor: auditDotColor(e.enmax_acdnevent) }}
                          />
                          {!isLast && <div className={styles.timelineConnector} />}
                        </div>
                        <div className={styles.timelineContent}>
                          <Text className={styles.timelineLabel}>
                            {formatAuditLabel(e.enmax_acdnevent, e.enmax_acdnevent_Formatted)}
                          </Text>
                          {e.actedBy_Formatted && (
                            <Text size={200} className={styles.timelineMeta}>
                              by {e.actedBy_Formatted}
                            </Text>
                          )}
                          <Text size={200} className={styles.timelineMeta}>
                            {new Date(e.createdon).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </Text>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </DrawerBody>
      </OverlayDrawer>

      <DeclineDialog
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        onConfirm={handleDecline}
        isSubmitting={approveMutation.isPending}
      />
    </>
  );
}
