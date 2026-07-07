import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Title2,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
  TabList,
  Tab,
  CounterBadge,
  useToastController,
  Toast,
  ToastTitle,
  Toaster,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { usePendingReservations, type PendingReservation } from "./hooks/usePendingReservations";
import { useApproveReservation } from "./hooks/useApproveReservation";
import { ReservationQueueGrid } from "./ReservationQueueGrid";
import { ReservationDetailPanel } from "./ReservationDetailPanel";
import { BulkApproveDialog } from "./BulkApproveDialog";
import { ReservationDrawingsPanel } from "../checkout/components/ReservationDrawingsPanel";
import { useCheckins, CHECKIN_STATUS_AWAITING } from "./hooks/useCheckins";
import { CheckinQueueGrid } from "./CheckinQueueGrid";
import { CheckoutRequestQueueGrid } from "./CheckoutRequestQueueGrid";
import { CheckoutStatus } from "../checkout/api/checkoutClient";

const TOASTER_ID = "approvals-toaster";

type TabValue = "pending" | "approved" | "rejected" | "checkouts" | "checkins";
const TAB_STATUS: Record<"pending" | "approved" | "rejected", 1 | 2 | 3> = { pending: 1, approved: 2, rejected: 3 };

const FADE_UP = {
  from: { opacity: "0", transform: "translateY(8px)" },
  to:   { opacity: "1", transform: "translateY(0)" },
};

const EMPTY_MESSAGES: Record<TabValue, string> = {
  pending:  "No reservations awaiting approval.",
  approved: "No approved reservations.",
  rejected: "No rejected reservations.",
  checkouts: "No Check Out requests awaiting approval.",
  checkins: "No Check Ins awaiting validation.",
};

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  header: {
    paddingLeft: tokens.spacingHorizontalL,
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    borderLeftColor: tokens.colorBrandForeground1,
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationFillMode: "both",
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
    display: "block",
  },
  content: {
    animationName: FADE_UP,
    animationDuration: "150ms",
    animationFillMode: "both",
  },
});

export function ApprovalsPage() {
  const styles = useStyles();
  const [searchParams] = useSearchParams();
  const paramTab = searchParams.get("tab");
  const initialTab: TabValue =
    paramTab === "approved" || paramTab === "rejected" || paramTab === "checkins" || paramTab === "checkouts"
      ? paramTab
      : "pending";
  const [activeTab, setActiveTab]               = useState<TabValue>(initialTab);
  const [selectedReservation, setSelectedReservation] = useState<PendingReservation | null>(null);
  const [bulkApproveList, setBulkApproveList]   = useState<PendingReservation[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen]     = useState(false);

  const isCheckins         = activeTab === "checkins";
  const isCheckoutRequests = activeTab === "checkouts";
  const isReservationTab   = !isCheckins && !isCheckoutRequests;
  // The checkout table backs both the Check Ins queue and the Check Out request queue.
  const checkoutQuery  = useCheckins(isCheckins || isCheckoutRequests);
  const currentQuery   = usePendingReservations(isReservationTab ? TAB_STATUS[activeTab as "pending" | "approved" | "rejected"] : 1);
  const approveMutation = useApproveReservation();
  const { dispatchToast } = useToastController(TOASTER_ID);

  const checkinRows       = checkoutQuery.data?.filter((c) => c.status !== CheckoutStatus.Requested) ?? [];
  const checkoutRequests  = checkoutQuery.data?.filter((c) => c.status === CheckoutStatus.Requested) ?? [];

  function handleTabChange(_: unknown, data: { value: unknown }) {
    setActiveTab(data.value as TabValue);
    setSelectedReservation(null);
  }

  async function handleBulkApprove() {
    let successCount = 0;
    let failCount    = 0;

    for (const reservation of bulkApproveList) {
      try {
        await approveMutation.mutateAsync({
          reservationId: reservation.enmax_acdnreservationid,
          decision:      "Approved",
          businessCode:  reservation.businessCode,
          assetCode:     reservation.assetCode,
          unitCode:      reservation.unitCode,
          domainCode:    reservation.domainCode,
          systemCode:    reservation.systemCode,
          kindCode:      reservation.kindCode,
          drawingCount:  reservation.enmax_acdndrawingcount,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    setBulkDialogOpen(false);
    setBulkApproveList([]);

    dispatchToast(
      <Toast>
        <ToastTitle>
          {successCount > 0 && `${successCount} approved.`}
          {failCount > 0 && ` ${failCount} failed — check the queue.`}
        </ToastTitle>
      </Toast>,
      { intent: failCount > 0 ? "error" : "success" },
    );
  }

  const isPending     = activeTab === "pending";
  const loadedCount   = currentQuery.data?.length ?? 0;
  const showBadge     = isReservationTab && !currentQuery.isPending && loadedCount > 0;
  const awaitingCheckins = checkinRows.filter((c) => c.status === CHECKIN_STATUS_AWAITING).length;
  const pendingCheckoutRequests = checkoutRequests.length;

  const tabCountLabel = `${loadedCount} ${activeTab === "pending" ? "pending" : activeTab === "approved" ? "approved" : "rejected"}`;

  return (
    <div className={styles.page}>
      <Toaster toasterId={TOASTER_ID} />

      <div className={styles.header}>
        <Title2 as="h1">Approvals</Title2>
        <Text size={300} className={styles.subtitle}>
          Review and action pending Drawing/Document Reservations and Check In / Check Out requests.
        </Text>
      </div>

      <TabList
        selectedValue={activeTab}
        onTabSelect={handleTabChange}
      >
        <Tab value="pending">
          Pending
          {activeTab === "pending" && showBadge && (
            <CounterBadge count={loadedCount} color="danger" size="small" style={{ marginLeft: "6px" }} />
          )}
        </Tab>
        <Tab value="approved">
          Approved
          {activeTab === "approved" && showBadge && (
            <CounterBadge count={loadedCount} color="brand" size="small" style={{ marginLeft: "6px" }} />
          )}
        </Tab>
        <Tab value="rejected">
          Rejected
          {activeTab === "rejected" && showBadge && (
            <CounterBadge count={loadedCount} color="informative" size="small" style={{ marginLeft: "6px" }} />
          )}
        </Tab>
        <Tab value="checkouts">
          Check Out requests
          {isCheckoutRequests && !checkoutQuery.isPending && pendingCheckoutRequests > 0 && (
            <CounterBadge count={pendingCheckoutRequests} color="danger" size="small" style={{ marginLeft: "6px" }} />
          )}
        </Tab>
        <Tab value="checkins">
          Check Ins
          {isCheckins && !checkoutQuery.isPending && awaitingCheckins > 0 && (
            <CounterBadge count={awaitingCheckins} color="danger" size="small" style={{ marginLeft: "6px" }} />
          )}
        </Tab>
      </TabList>

      {isCheckoutRequests && (
        <div className={styles.content}>
          {checkoutQuery.isPending && <Spinner label="Loading…" />}
          {checkoutQuery.isError && (
            <MessageBar intent="error">
              <MessageBarBody>Failed to load Check Out requests. Please refresh.</MessageBarBody>
            </MessageBar>
          )}
          {checkoutQuery.data && <CheckoutRequestQueueGrid requests={checkoutRequests} />}
        </div>
      )}

      {isCheckins && (
        <div className={styles.content}>
          {checkoutQuery.isPending && <Spinner label="Loading…" />}
          {checkoutQuery.isError && (
            <MessageBar intent="error">
              <MessageBarBody>Failed to load Check Ins. Please refresh.</MessageBarBody>
            </MessageBar>
          )}
          {checkoutQuery.data && <CheckinQueueGrid checkins={checkinRows} />}
        </div>
      )}

      {isReservationTab && currentQuery.isPending && <Spinner label="Loading…" />}

      {isReservationTab && currentQuery.isError && (
        <MessageBar intent="error">
          <MessageBarBody>Failed to load reservations. Please refresh.</MessageBarBody>
        </MessageBar>
      )}

      {isReservationTab && currentQuery.data && (
        <div className={styles.content}>
          <ReservationQueueGrid
            reservations={currentQuery.data}
            onSelect={(r) => setSelectedReservation(r)}
            emptyMessage={EMPTY_MESSAGES[activeTab]}
            countLabel={tabCountLabel}
            onBulkApprove={isPending
              ? (list) => { setBulkApproveList(list); setBulkDialogOpen(true); }
              : undefined
            }
          />
        </div>
      )}

      {activeTab === "approved" ? (
        <ReservationDrawingsPanel
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
        />
      ) : (
        <ReservationDetailPanel
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
          readonly={!isPending}
          onApproved={(num) =>
            dispatchToast(
              <Toast><ToastTitle>{num} approved — numbers issued.</ToastTitle></Toast>,
              { intent: "success" },
            )
          }
          onDeclined={(num) =>
            dispatchToast(
              <Toast><ToastTitle>{num} declined.</ToastTitle></Toast>,
              { intent: "warning" },
            )
          }
        />
      )}

      <BulkApproveDialog
        open={bulkDialogOpen}
        reservations={bulkApproveList}
        onClose={() => setBulkDialogOpen(false)}
        onConfirm={() => void handleBulkApprove()}
        isSubmitting={approveMutation.isPending}
      />
    </div>
  );
}
