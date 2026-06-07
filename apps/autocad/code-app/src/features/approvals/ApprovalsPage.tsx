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

const TOASTER_ID = "approvals-toaster";

type TabValue = "pending" | "approved" | "rejected" | "checkins";
const TAB_STATUS: Record<"pending" | "approved" | "rejected", 1 | 2 | 3> = { pending: 1, approved: 2, rejected: 3 };

const FADE_UP = {
  from: { opacity: "0", transform: "translateY(8px)" },
  to:   { opacity: "1", transform: "translateY(0)" },
};

const EMPTY_MESSAGES: Record<TabValue, string> = {
  pending:  "No reservations awaiting approval.",
  approved: "No approved reservations.",
  rejected: "No rejected reservations.",
  checkins: "No check-ins awaiting validation.",
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
    paramTab === "approved" || paramTab === "rejected" || paramTab === "checkins" ? paramTab : "pending";
  const [activeTab, setActiveTab]               = useState<TabValue>(initialTab);
  const [selectedReservation, setSelectedReservation] = useState<PendingReservation | null>(null);
  const [bulkApproveList, setBulkApproveList]   = useState<PendingReservation[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen]     = useState(false);

  const isCheckins     = activeTab === "checkins";
  const currentQuery   = usePendingReservations(isCheckins ? 1 : TAB_STATUS[activeTab]);
  const checkinsQuery  = useCheckins(isCheckins);
  const approveMutation = useApproveReservation();
  const { dispatchToast } = useToastController(TOASTER_ID);

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
  const showBadge     = !currentQuery.isPending && loadedCount > 0;
  const awaitingCheckins = checkinsQuery.data?.filter((c) => c.status === CHECKIN_STATUS_AWAITING).length ?? 0;

  const tabCountLabel = `${loadedCount} ${activeTab === "pending" ? "pending" : activeTab === "approved" ? "approved" : "rejected"}`;

  return (
    <div className={styles.page}>
      <Toaster toasterId={TOASTER_ID} />

      <div className={styles.header}>
        <Title2 as="h1">Approvals</Title2>
        <Text size={300} className={styles.subtitle}>
          Review and action pending drawing number reservations.
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
        <Tab value="checkins">
          Check-ins
          {isCheckins && !checkinsQuery.isPending && awaitingCheckins > 0 && (
            <CounterBadge count={awaitingCheckins} color="danger" size="small" style={{ marginLeft: "6px" }} />
          )}
        </Tab>
      </TabList>

      {isCheckins && (
        <div className={styles.content}>
          {checkinsQuery.isPending && <Spinner label="Loading…" />}
          {checkinsQuery.isError && (
            <MessageBar intent="error">
              <MessageBarBody>Failed to load check-ins. Please refresh.</MessageBarBody>
            </MessageBar>
          )}
          {checkinsQuery.data && <CheckinQueueGrid checkins={checkinsQuery.data} />}
        </div>
      )}

      {!isCheckins && currentQuery.isPending && <Spinner label="Loading…" />}

      {!isCheckins && currentQuery.isError && (
        <MessageBar intent="error">
          <MessageBarBody>Failed to load reservations. Please refresh.</MessageBarBody>
        </MessageBar>
      )}

      {!isCheckins && currentQuery.data && (
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
