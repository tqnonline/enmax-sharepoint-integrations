import { Badge, Text, tokens, makeStyles } from "@fluentui/react-components";
import { useUserRole } from "../../../auth/useUserRole";
import { useCurrentUser } from "../../../auth/useCurrentUser";
import { DrawingState } from "../api/checkoutClient";
import type { DrawingForPanel, CheckoutForPanel, DrawingStateValue } from "../api/checkoutClient";
import { CheckOutButton } from "./CheckOutButton";
import { SubmitRevisionDrawer } from "./SubmitRevisionDrawer";
import { ValidationDrawer } from "./ValidationDrawer";
import { ForceCheckInDialog } from "./ForceCheckInDialog";

const STATE_LABELS: Record<DrawingStateValue, string> = {
  [DrawingState.None]:               "Unknown",
  [DrawingState.Available]:          "Available",
  [DrawingState.CheckedOut]:         "Checked Out",
  [DrawingState.AwaitingValidation]: "Awaiting Validation",
  [DrawingState.CheckedIn]:          "Checked In",
  [DrawingState.Obsolete]:           "Obsolete",
  [DrawingState.Void]:               "Void",
};

type BadgeColor = "success" | "warning" | "informative" | "brand" | "subtle";

const STATE_BADGE_COLOR: Record<DrawingStateValue, BadgeColor> = {
  [DrawingState.None]:               "subtle",
  [DrawingState.Available]:          "success",
  [DrawingState.CheckedOut]:         "warning",
  [DrawingState.AwaitingValidation]: "informative",
  [DrawingState.CheckedIn]:          "brand",
  [DrawingState.Obsolete]:           "subtle",
  [DrawingState.Void]:               "subtle",
};

const useStyles = makeStyles({
  readOnly: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  meta: {
    color: tokens.colorNeutralForeground3,
  },
});

interface ReadOnlyProps {
  drawing: DrawingForPanel;
  openCheckout?: CheckoutForPanel;
}

function ReadOnlyStateLabel({ drawing, openCheckout }: ReadOnlyProps) {
  const styles = useStyles();
  const label = STATE_LABELS[drawing.state] ?? "Unknown";
  const color = STATE_BADGE_COLOR[drawing.state] ?? "subtle";

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
  adminMode?: boolean;
}

export function DrawingActionsPanel({ drawing, openCheckout, adminMode }: Props) {
  const { role } = useUserRole();
  const { data: currentUser } = useCurrentUser();

  if (drawing.state === DrawingState.Available) {
    return <CheckOutButton drawingId={drawing.id} />;
  }

  if (
    adminMode &&
    drawing.state === DrawingState.CheckedOut &&
    openCheckout &&
    (role === "Admin" || role === "Approver")
  ) {
    return <ForceCheckInDialog checkoutId={openCheckout.id} />;
  }

  if (
    drawing.state === DrawingState.CheckedOut &&
    openCheckout &&
    openCheckout.checkedOutBy === currentUser?.id
  ) {
    return (
      <SubmitRevisionDrawer
        checkoutId={openCheckout.id}
        drawingId={drawing.id}
        currentRevision={drawing.currentRevision}
        spLibraryUrl={drawing.spLibraryUrl}
      />
    );
  }

  if (
    drawing.state === DrawingState.AwaitingValidation &&
    openCheckout &&
    (role === "Approver" || role === "Admin")
  ) {
    return <ValidationDrawer checkout={openCheckout} drawing={drawing} />;
  }

  if (drawing.state === DrawingState.CheckedOut && openCheckout && role === "Admin") {
    return <ForceCheckInDialog checkoutId={openCheckout.id} />;
  }

  return <ReadOnlyStateLabel drawing={drawing} openCheckout={openCheckout} />;
}
