import {
  Badge,
  Button,
  Spinner,
  Text,
  Toast,
  ToastTitle,
  tokens,
  makeStyles,
  useToastController,
} from "@fluentui/react-components";
import {
  ArrowDownload24Regular,
  Clock24Regular,
  ArrowUpload24Regular,
} from "@fluentui/react-icons";
import { useCurrentUser } from "../../../auth/useCurrentUser";
import { useAppConfig } from "../../../config/useAppConfig";
import { isCheckInEnabledForTaxonomy } from "../../../config/checkoutTaxonomyConfig";
import { useCheckOutSheets } from "../hooks/useCheckOutSheets";
import { SubmitRevisionDrawer } from "./SubmitRevisionDrawer";
import { CheckoutStatus } from "../api/checkoutClient";
import type { SheetCheckoutInfo } from "../../approvals/hooks/useSheetCheckouts";
import { SHEET_STATE_AVAILABLE } from "../../approvals/hooks/useDrawingSheets";
import { checkoutSingleLabel } from "../../reserve/terminology";
import { sharePointSiteForTaxonomy } from "../../sharepoint/sharepointUrls";
import { SheetStatusBadge } from "./SheetStatusBadge";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
  pending: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorPaletteYellowBackground2,
    border: `1px solid ${tokens.colorPaletteYellowBorder2}`,
  },
  meta: {
    color: tokens.colorNeutralForeground2,
  },
});

interface Props {
  drawingId: string;
  sheetId: string;
  displayNumber: string;
  sheetState?: number;
  checkout?: SheetCheckoutInfo;
  checkoutEnabled: boolean;
  reservationType?: number | null;
  documentSubtype?: number | null;
  toasterId: string;
}

export function SheetDocumentActions({
  drawingId,
  sheetId,
  displayNumber,
  sheetState,
  checkout,
  checkoutEnabled,
  reservationType,
  documentSubtype,
  toasterId,
}: Props) {
  const styles = useStyles();
  const { data: currentUser } = useCurrentUser();
  const appConfig = useAppConfig();
  const requireApproval = appConfig.RequireCheckOutApproval ?? true;
  const { dispatchToast } = useToastController(toasterId);
  const checkOutSheets = useCheckOutSheets();

  const canRequest = checkoutEnabled
    && sheetState === SHEET_STATE_AVAILABLE
    && (!checkout || (
      checkout.status !== CheckoutStatus.Requested
      && checkout.status !== CheckoutStatus.Open
      && checkout.status !== CheckoutStatus.AwaitingValidation
    ));

  const isPendingRequest = checkout?.status === CheckoutStatus.Requested;
  const isOwnerCheckout = !!checkout?.checkedOutBy
    && !!currentUser?.id
    && checkout.checkedOutBy === currentUser.id;
  const canSubmitCheckIn = checkout?.status === CheckoutStatus.Open
    && !!checkout.checkoutId
    && isOwnerCheckout
    && isCheckInEnabledForTaxonomy(appConfig, reservationType, documentSubtype);

  function requestCheckout() {
    checkOutSheets.mutate(
      { drawingId, sheetIds: [sheetId] },
      {
        onSuccess: () => {
          dispatchToast(
            <Toast>
              <ToastTitle>
                {requireApproval
                  ? "Check Out request submitted. Pending approval."
                  : "Document checked out."}
              </ToastTitle>
            </Toast>,
            { intent: "success" },
          );
        },
        onError: (err) => {
          dispatchToast(
            <Toast>
              <ToastTitle>{err instanceof Error ? err.message : "Check Out request failed."}</ToastTitle>
            </Toast>,
            { intent: "error" },
          );
        },
      },
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <Text weight="semibold" size={300}>Status</Text>
        <SheetStatusBadge sheetState={sheetState} checkout={checkout} />
      </div>

      {isPendingRequest && (
        <div className={styles.pending}>
          <Clock24Regular color={tokens.colorPaletteYellowForeground2} />
          <div>
            <Badge appearance="filled" color="warning" size="small">Check Out pending approval</Badge>
            <Text size={200} className={styles.meta} block>
              {currentUser?.displayName
                ? "Your request is awaiting an approver. You will be notified when it is decided."
                : "This document has a pending Check Out request."}
            </Text>
          </div>
        </div>
      )}

      {canRequest && (
        <Button
          appearance="primary"
          size="medium"
          icon={checkOutSheets.isPending ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
          disabled={checkOutSheets.isPending}
          onClick={requestCheckout}
        >
          {checkOutSheets.isPending ? "Submitting…" : checkoutSingleLabel(requireApproval)}
        </Button>
      )}

      {canSubmitCheckIn && checkout?.checkoutId && (
        <SubmitRevisionDrawer
          checkoutId={checkout.checkoutId}
          drawingId={drawingId}
          drawingNumber={displayNumber}
          site={sharePointSiteForTaxonomy(reservationType)}
          reservationType={reservationType}
          documentSubtype={documentSubtype}
          triggerAppearance="secondary"
          triggerIcon={<ArrowUpload24Regular />}
          triggerLabel="Submit Check In"
        />
      )}

      {checkout?.status === CheckoutStatus.AwaitingValidation && (
        <div className={styles.pending}>
          <Clock24Regular />
          <Text size={200}>Check In submitted — awaiting validation.</Text>
        </div>
      )}
    </div>
  );
}
