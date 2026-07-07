import { Badge, Text, tokens, makeStyles } from "@fluentui/react-components";
import { useState } from "react";
import { useUserRole } from "../../../auth/useUserRole";
import { useCurrentUser } from "../../../auth/useCurrentUser";
import { useAppConfig } from "../../../config/useAppConfig";
import { useCheckOut } from "../hooks/useCheckOut";
import { DrawingState, DRAWING_STATE_LABELS, DRAWING_STATE_BADGE_COLOR, CheckoutStatus } from "../api/checkoutClient";
import type { DrawingForPanel, CheckoutForPanel } from "../api/checkoutClient";
import { CheckOutButton } from "./CheckOutButton";
import { SubmitRevisionDrawer } from "./SubmitRevisionDrawer";
import { ValidationDrawer } from "./ValidationDrawer";
import { ForceCheckInDialog } from "./ForceCheckInDialog";
import { FinalizeDialog } from "./FinalizeDialog";
import { MarkObsoleteDialog } from "./MarkObsoleteDialog";
import { ReleaseDrawingDialog } from "./ReleaseDrawingDialog";
import { SplitButton } from "../../../components/SplitButton";

const useStyles = makeStyles({
  readOnly: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  meta: {
    color: tokens.colorNeutralForeground3,
  },
  actionRow: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
});

interface ReadOnlyProps {
  drawing: DrawingForPanel;
  openCheckout?: CheckoutForPanel;
}

function ReadOnlyStateLabel({ drawing, openCheckout }: ReadOnlyProps) {
  const styles = useStyles();
  const label = DRAWING_STATE_LABELS[drawing.state] ?? "Unknown";
  const color = DRAWING_STATE_BADGE_COLOR[drawing.state] ?? "subtle";

  return (
    <div className={styles.readOnly}>
      <Badge appearance="filled" color={color} shape="rounded">
        {label}
      </Badge>
      {drawing.state === DrawingState.CheckedOut && openCheckout?.checkedOutBy && (
        <Text size={200} className={styles.meta}>
          checked out by someone else
        </Text>
      )}
    </div>
  );
}

interface Props {
  drawing: DrawingForPanel;
  openCheckout?: CheckoutForPanel;
  variant?: "inline" | "split";
}

export function DrawingActionsPanel({ drawing, openCheckout, variant = "inline" }: Props) {
  const styles = useStyles();
  const { role } = useUserRole();
  const { data: currentUser } = useCurrentUser();
  const { RequireCheckOutApproval, ShowFinalizeButton, ShowObsoleteButton } = useAppConfig();
  const isAdmin    = role === "Admin";
  const isApprover = role === "Approver";
  const isOwner      = !!drawing.ownerId && drawing.ownerId === currentUser?.id;
  const forceRelease = isAdmin && !isOwner;
  const [openDialog, setOpenDialog] = useState<null | "finalize" | "obsolete" | "release" | "forcecheckin">(null);
  const checkOut = useCheckOut();

  // Business rule: Finalize and Mark Obsolete require at least one prior check-in.
  // A drawing only gets a currentRevision after its first successful check-in
  // (ApproveCheckin/SubmitRevision/ForceCheckin write it; creation does not), so an
  // empty currentRevision means the drawing has never been checked in.
  const hasCheckin = Boolean(drawing.currentRevision);
  // F-06 release: owner self-releases / admin force-releases (owner notified by the
  // plug-in). Only an Available drawing never checked out can be released; hasCheckin
  // is the cheap proxy, the plug-in enforces the authoritative "no checkout rows" rule.
  const canRelease = (isOwner || isAdmin) && !hasCheckin;

  if (drawing.state === DrawingState.Finalized ||
      drawing.state === DrawingState.Obsolete ||
      drawing.state === DrawingState.Void) {
    return <ReadOnlyStateLabel drawing={drawing} openCheckout={openCheckout} />;
  }

  // WS3 gated Check Out: while a request is pending, the drawing is still Available but must
  // not offer another Check Out. Show a read-only "requested" badge instead.
  if (openCheckout?.status === CheckoutStatus.Requested) {
    const mine = openCheckout.checkedOutBy === currentUser?.id;
    return (
      <div className={styles.readOnly}>
        <Badge appearance="filled" color="informative" shape="rounded">
          Check Out requested
        </Badge>
        <Text size={200} className={styles.meta}>
          {mine ? "Your Check Out is pending approval" : "Pending approver decision"}
        </Text>
      </div>
    );
  }

  if (drawing.state === DrawingState.Available) {
    if (variant === "split") {
      return (
        <>
          <SplitButton
            primaryLabel={
              checkOut.isPending
                ? (RequireCheckOutApproval ? "Requesting…" : "Checking out…")
                : (RequireCheckOutApproval ? "Request Check Out" : "Check Out")
            }
            primaryDisabled={checkOut.isPending}
            primaryLoading={checkOut.isPending}
            onPrimary={() => checkOut.mutate(drawing.id)}
            items={[
              ...(ShowFinalizeButton && hasCheckin ? [{ key: "finalize", label: "Finalize", onClick: () => setOpenDialog("finalize") }] : []),
              ...(ShowObsoleteButton && isAdmin && hasCheckin ? [{ key: "obsolete", label: "Mark Obsolete", onClick: () => setOpenDialog("obsolete") }] : []),
              ...(canRelease ? [{ key: "release", label: "Release", onClick: () => setOpenDialog("release") }] : []),
            ]}
          />
          {checkOut.isError && (
            <Text size={200} style={{ color: tokens.colorPaletteRedForeground1, display: "block", marginTop: tokens.spacingVerticalXS }}>Check Out failed. Try again.</Text>
          )}
          <FinalizeDialog drawingId={drawing.id} hideTrigger open={openDialog === "finalize"} onOpenChange={o => setOpenDialog(o ? "finalize" : null)} />
          <MarkObsoleteDialog drawingId={drawing.id} hideTrigger open={openDialog === "obsolete"} onOpenChange={o => setOpenDialog(o ? "obsolete" : null)} />
          <ReleaseDrawingDialog drawingId={drawing.id} forceRelease={forceRelease} hideTrigger open={openDialog === "release"} onOpenChange={o => setOpenDialog(o ? "release" : null)} />
        </>
      );
    }
    return (
      <div className={styles.actionRow}>
        <CheckOutButton drawingId={drawing.id} />
        {ShowFinalizeButton && hasCheckin && <FinalizeDialog drawingId={drawing.id} />}
        {ShowObsoleteButton && isAdmin && hasCheckin && <MarkObsoleteDialog drawingId={drawing.id} />}
        {canRelease && <ReleaseDrawingDialog drawingId={drawing.id} forceRelease={forceRelease} />}
      </div>
    );
  }

  if (drawing.state === DrawingState.CheckedOut &&
      openCheckout && openCheckout.checkedOutBy === currentUser?.id) {
    return (
      <SubmitRevisionDrawer
        checkoutId={openCheckout.id}
        drawingId={drawing.id}
      />
    );
  }

  if (drawing.state === DrawingState.CheckedOut && openCheckout && (isAdmin || isApprover)) {
    // A checked-out drawing cannot be released/voided (it is "used"); the only admin
    // action here is Force Check In.
    return (
      <div className={styles.actionRow}>
        <ForceCheckInDialog
          checkoutId={openCheckout.id}
          drawingId={drawing.id}
        />
      </div>
    );
  }

  if (drawing.state === DrawingState.AwaitingValidation && openCheckout && (isApprover || isAdmin)) {
    return <ValidationDrawer checkout={openCheckout} drawing={drawing} />;
  }

  return <ReadOnlyStateLabel drawing={drawing} openCheckout={openCheckout} />;
}
