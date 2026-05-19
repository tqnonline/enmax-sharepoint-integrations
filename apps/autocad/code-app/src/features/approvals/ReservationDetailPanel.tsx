import { useState } from "react";
import {
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  InlineDrawer,
  Button,
  Text,
  Badge,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Spinner,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { Dismiss24Regular, Warning24Regular } from "@fluentui/react-icons";
import type { PendingReservation } from "./hooks/usePendingReservations";
import { useApproveReservation } from "./hooks/useApproveReservation";
import { useApprovalAudit } from "./hooks/useApprovalAudit";
import { DeclineDialog } from "./DeclineDialog";

const useStyles = makeStyles({
  field: {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalS,
  },
  label:   { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2 },
  actions: { display: "flex", gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalL },
  auditRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

interface Props {
  reservation: PendingReservation | null;
  onClose: () => void;
}

export function ReservationDetailPanel({ reservation, onClose }: Props) {
  const styles = useStyles();
  const [declineOpen, setDeclineOpen] = useState(false);
  const approveMutation = useApproveReservation();
  const auditQuery = useApprovalAudit(reservation?.enmax_acdnreservationid ?? null);

  function handleApprove() {
    if (!reservation) return;
    approveMutation.mutate(
      { reservationId: reservation.enmax_acdnreservationid, decision: "Approved" },
      { onSuccess: onClose },
    );
  }

  function handleDecline(reason: string) {
    if (!reservation) return;
    approveMutation.mutate(
      { reservationId: reservation.enmax_acdnreservationid, decision: "Declined", reason },
      { onSuccess: () => { setDeclineOpen(false); onClose(); } },
    );
  }

  const compositionPreview = reservation
    ? `${reservation.businessCode}-${reservation.assetCode}-${reservation.unitCode}-${reservation.domainCode}-${reservation.systemCode}-${reservation.kindCode}-????`
    : "";

  return (
    <>
      <InlineDrawer open={!!reservation} position="end" style={{ width: "480px" }}>
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} aria-label="Close panel" />
            }
          >
            {reservation?.enmax_acdnreservationnumber ?? "Reservation"}
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          {reservation && (
            <>
              {reservation.enmax_acdnoverride && (
                <Badge icon={<Warning24Regular />} color="warning" style={{ marginBottom: "0.5rem" }}>
                  Validation override
                </Badge>
              )}

              <div className={styles.field}>
                <span className={styles.label}>Requester</span>
                <span>{reservation._createdby_value_Formatted}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Composition</span>
                <span style={{ fontFamily: "monospace" }}>{compositionPreview}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Count</span>
                <span>{reservation.enmax_acdndrawingcount}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Reason</span>
                <span>{reservation.enmax_acdnreason}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Submitted</span>
                <span>{new Date(reservation.createdon).toLocaleString()}</span>
              </div>

              {approveMutation.isError && (
                <Text style={{ color: tokens.colorPaletteRedForeground1 }}>
                  Action failed: {approveMutation.error?.message}
                </Text>
              )}

              <div className={styles.actions}>
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
                <Button
                  appearance="subtle"
                  as="a"
                  href={`#/reservations/${reservation.enmax_acdnreservationid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in new tab
                </Button>
              </div>

              <Accordion collapsible style={{ marginTop: "1rem" }}>
                <AccordionItem value="audit">
                  <AccordionHeader>Audit history</AccordionHeader>
                  <AccordionPanel>
                    {auditQuery.isPending && <Spinner size="tiny" />}
                    {auditQuery.data?.map((e) => (
                      <div key={e.enmax_acdnauditeventid} className={styles.auditRow}>
                        <Text>{e.enmax_acdnevent_Formatted} by {e._modifiedby_value_Formatted}</Text>
                        <Text size={200}>{new Date(e.modifiedon).toLocaleString()}</Text>
                      </div>
                    ))}
                    {auditQuery.data?.length === 0 && <Text>No audit history yet.</Text>}
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            </>
          )}
        </DrawerBody>
      </InlineDrawer>

      <DeclineDialog
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        onConfirm={handleDecline}
        isSubmitting={approveMutation.isPending}
      />
    </>
  );
}
