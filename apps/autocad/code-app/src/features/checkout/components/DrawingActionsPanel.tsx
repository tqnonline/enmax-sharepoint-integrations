import { Badge, Text, tokens, makeStyles, Menu, MenuTrigger, MenuButton, MenuPopover, MenuList, MenuItem } from "@fluentui/react-components";
import { useState } from "react";
import { useUserRole } from "../../../auth/useUserRole";
import { useCurrentUser } from "../../../auth/useCurrentUser";
import { useCheckOut } from "../hooks/useCheckOut";
import { DrawingState, DRAWING_STATE_LABELS, DRAWING_STATE_BADGE_COLOR } from "../api/checkoutClient";
import type { DrawingForPanel, CheckoutForPanel } from "../api/checkoutClient";
import { CheckOutButton } from "./CheckOutButton";
import { SubmitRevisionDrawer } from "./SubmitRevisionDrawer";
import { ValidationDrawer } from "./ValidationDrawer";
import { ForceCheckInDialog } from "./ForceCheckInDialog";
import { FinalizeDialog } from "./FinalizeDialog";
import { MarkObsoleteDialog } from "./MarkObsoleteDialog";
import { MarkVoidDialog } from "./MarkVoidDialog";
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
      {drawing.currentRevision && (
        <Text size={200} className={styles.meta}>
          Rev {drawing.currentRevision}
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
  const isAdmin    = role === "Admin";
  const isApprover = role === "Approver";
  const [openDialog, setOpenDialog] = useState<null | "finalize" | "obsolete" | "void" | "forcecheckin">(null);
  const checkOut = useCheckOut();

  // Business rule: Finalize and Mark Obsolete require at least one prior check-in.
  // A drawing only gets a currentRevision after its first successful check-in
  // (ApproveCheckin/SubmitRevision/ForceCheckin write it; creation does not), so an
  // empty currentRevision means the drawing has never been checked in. Mark Void is
  // not restricted.
  const hasCheckin = Boolean(drawing.currentRevision);

  if (drawing.state === DrawingState.Finalized ||
      drawing.state === DrawingState.Obsolete ||
      drawing.state === DrawingState.Void) {
    return <ReadOnlyStateLabel drawing={drawing} openCheckout={openCheckout} />;
  }

  if (drawing.state === DrawingState.Available) {
    if (variant === "split") {
      return (
        <>
          <SplitButton
            primaryLabel={checkOut.isPending ? "Checking out…" : "Check Out"}
            primaryDisabled={checkOut.isPending}
            primaryLoading={checkOut.isPending}
            onPrimary={() => checkOut.mutate(drawing.id)}
            items={[
              ...(hasCheckin ? [{ key: "finalize", label: "Finalize", onClick: () => setOpenDialog("finalize") }] : []),
              ...(isAdmin && hasCheckin ? [{ key: "obsolete", label: "Mark Obsolete", onClick: () => setOpenDialog("obsolete") }] : []),
              ...(isAdmin ? [{ key: "void", label: "Mark Void", onClick: () => setOpenDialog("void") }] : []),
            ]}
          />
          {checkOut.isError && (
            <Text size={200} style={{ color: tokens.colorPaletteRedForeground1, display: "block", marginTop: tokens.spacingVerticalXS }}>Check out failed. Try again.</Text>
          )}
          <FinalizeDialog drawingId={drawing.id} hideTrigger open={openDialog === "finalize"} onOpenChange={o => setOpenDialog(o ? "finalize" : null)} />
          <MarkObsoleteDialog drawingId={drawing.id} hideTrigger open={openDialog === "obsolete"} onOpenChange={o => setOpenDialog(o ? "obsolete" : null)} />
          <MarkVoidDialog drawingId={drawing.id} hideTrigger open={openDialog === "void"} onOpenChange={o => setOpenDialog(o ? "void" : null)} />
        </>
      );
    }
    return (
      <div className={styles.actionRow}>
        <CheckOutButton drawingId={drawing.id} />
        {hasCheckin && <FinalizeDialog drawingId={drawing.id} />}
        {isAdmin && hasCheckin && <MarkObsoleteDialog drawingId={drawing.id} />}
        {isAdmin && <MarkVoidDialog drawingId={drawing.id} />}
      </div>
    );
  }

  if (drawing.state === DrawingState.CheckedOut &&
      openCheckout && openCheckout.checkedOutBy === currentUser?.id) {
    return (
      <SubmitRevisionDrawer
        checkoutId={openCheckout.id}
        drawingId={drawing.id}
        currentRevision={drawing.currentRevision}
        spLibraryUrl={drawing.spLibraryUrl}
      />
    );
  }

  if (drawing.state === DrawingState.CheckedOut && openCheckout && (isAdmin || isApprover)) {
    if (variant === "split") {
      return (
        <div className={styles.actionRow}>
          <ForceCheckInDialog
            checkoutId={openCheckout.id}
            drawingId={drawing.id}
            currentRevision={drawing.currentRevision}
          />
          {isAdmin && (
            <Menu positioning="below-end">
              <MenuTrigger disableButtonEnhancement>
                <MenuButton appearance="outline" aria-label="More actions" />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem onClick={() => setOpenDialog("void")}>Mark Void</MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          )}
          {isAdmin && (
            <MarkVoidDialog drawingId={drawing.id} hideTrigger open={openDialog === "void"} onOpenChange={o => setOpenDialog(o ? "void" : null)} />
          )}
        </div>
      );
    }
    return (
      <div className={styles.actionRow}>
        <ForceCheckInDialog
          checkoutId={openCheckout.id}
          drawingId={drawing.id}
          currentRevision={drawing.currentRevision}
        />
        {isAdmin && <MarkVoidDialog drawingId={drawing.id} />}
      </div>
    );
  }

  if (drawing.state === DrawingState.AwaitingValidation && openCheckout && (isApprover || isAdmin)) {
    return <ValidationDrawer checkout={openCheckout} drawing={drawing} />;
  }

  return <ReadOnlyStateLabel drawing={drawing} openCheckout={openCheckout} />;
}
