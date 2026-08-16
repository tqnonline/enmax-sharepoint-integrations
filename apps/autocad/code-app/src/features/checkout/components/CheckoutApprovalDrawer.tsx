import { useState } from "react";
import {
  OverlayDrawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Button,
  Field,
  Textarea,
  Text,
  Spinner,
  Divider,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import {
  Dismiss24Regular,
  CheckmarkCircle24Regular,
  DismissCircle24Regular,
  PersonAvailable24Regular,
} from "@fluentui/react-icons";
import { useApproveCheckout } from "../hooks/useApproveCheckout";
import { DocumentTypeBadge } from "../../../components/DocumentTypeBadge";

const useStyles = makeStyles({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalXXL,
  },
  field: {
    display: "grid",
    gridTemplateColumns: "110px 1fr",
    gap: tokens.spacingHorizontalS,
    alignItems: "start",
  },
  label: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    paddingTop: "2px",
  },
  actions: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
    flexWrap: "wrap",
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
    display: "block",
  },
  declineSection: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
});

interface Props {
  checkoutId: string;
  drawingNumber: string;
  /** "Drawing" | "Standard" | "Procedure Form" — used in field label + copy. */
  typeLabel?: string;
  requestedByName: string;
}

/**
 * WS3 gated Check Out: an Approver/Admin approves or declines a pending Check Out request.
 * Approve → the record is checked out to the requester; Decline (reason 10+ chars) → the
 * request is closed and the record stays Available.
 */
export function CheckoutApprovalDrawer({ checkoutId, drawingNumber, typeLabel = "Drawing", requestedByName }: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const mutation = useApproveCheckout();

  function handleOpen() {
    setShowDecline(false);
    setDeclineReason("");
    mutation.reset();
    setOpen(true);
  }

  function handleClose() {
    setShowDecline(false);
    setDeclineReason("");
    mutation.reset();
    setOpen(false);
  }

  function handleApprove() {
    mutation.mutate({ checkoutId, decision: "Approved" }, { onSuccess: handleClose });
  }

  function handleDecline() {
    if (declineReason.length < 10) return;
    mutation.mutate(
      { checkoutId, decision: "Declined", reason: declineReason },
      { onSuccess: handleClose },
    );
  }

  return (
    <>
      <Button appearance="primary" icon={<PersonAvailable24Regular />} onClick={handleOpen}>
        Review Request
      </Button>

      <OverlayDrawer
        open={open}
        onOpenChange={(_, data) => { if (!data.open) handleClose(); }}
        position="end"
        size="small"
        modalType="non-modal"
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={handleClose} aria-label="Close" />
            }
          >
            Review Check Out request
          </DrawerHeaderTitle>
        </DrawerHeader>

        <DrawerBody>
          <div className={styles.body}>
            <div className={styles.field}>
              <span className={styles.label}>Type</span>
              <DocumentTypeBadge label={typeLabel} />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Number</span>
              <Text weight="semibold" style={{ fontFamily: "monospace" }}>{drawingNumber || "—"}</Text>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Requested by</span>
              <Text>{requestedByName || "Unknown"}</Text>
            </div>

            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              Approving checks this {typeLabel.toLowerCase()} out to the requester and opens their drop-off upload window.
            </Text>

            {mutation.isError && (
              <Text className={styles.error} size={200}>
                {mutation.error?.message ?? "Action failed. Try again."}
              </Text>
            )}

            <Divider />

            {!showDecline ? (
              <div className={styles.actions}>
                <Button
                  appearance="primary"
                  icon={<CheckmarkCircle24Regular />}
                  disabled={mutation.isPending}
                  onClick={handleApprove}
                >
                  {mutation.isPending ? <Spinner size="tiny" /> : "Approve"}
                </Button>
                <Button
                  appearance="secondary"
                  icon={<DismissCircle24Regular />}
                  disabled={mutation.isPending}
                  onClick={() => setShowDecline(true)}
                >
                  Decline
                </Button>
              </div>
            ) : (
              <div className={styles.declineSection}>
                <Text weight="semibold">Decline reason</Text>
                <Field
                  validationMessage={
                    declineReason.length > 0 && declineReason.length < 10 ? "Minimum 10 characters" : undefined
                  }
                  validationState={declineReason.length > 0 && declineReason.length < 10 ? "error" : "none"}
                >
                  <Textarea
                    placeholder="Explain why the Check Out is declined (min 10 chars)"
                    value={declineReason}
                    onChange={(_, d) => setDeclineReason(d.value)}
                    rows={3}
                  />
                </Field>
                <div className={styles.actions}>
                  <Button
                    appearance="primary"
                    disabled={declineReason.length < 10 || mutation.isPending}
                    onClick={handleDecline}
                  >
                    {mutation.isPending ? <Spinner size="tiny" /> : "Confirm decline"}
                  </Button>
                  <Button appearance="secondary" onClick={() => setShowDecline(false)} disabled={mutation.isPending}>
                    Back
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DrawerBody>
      </OverlayDrawer>
    </>
  );
}
