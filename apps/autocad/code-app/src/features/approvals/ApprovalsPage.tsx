import { useState } from "react";
import {
  Title2,
  Spinner,
  MessageBar,
  MessageBarBody,
  TabList,
  Tab,
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

const TOASTER_ID = "approvals-toaster";

type TabValue = "pending" | "approved" | "rejected";
const TAB_STATUS: Record<TabValue, 1 | 2 | 3> = { pending: 1, approved: 2, rejected: 3 };

const useStyles = makeStyles({
  tabs: { marginBottom: tokens.spacingVerticalL },
});

export function ApprovalsPage() {
  const styles = useStyles();
  const [activeTab, setActiveTab]               = useState<TabValue>("pending");
  const [selectedReservation, setSelectedReservation] = useState<PendingReservation | null>(null);
  const [bulkApproveList, setBulkApproveList]   = useState<PendingReservation[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen]     = useState(false);

  const currentQuery   = usePendingReservations(TAB_STATUS[activeTab]);
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

  const isPending = activeTab === "pending";

  return (
    <div>
      <Toaster toasterId={TOASTER_ID} />
      <Title2 as="h1" style={{ marginBottom: tokens.spacingVerticalL }}>Approvals</Title2>

      <TabList
        className={styles.tabs}
        selectedValue={activeTab}
        onTabSelect={handleTabChange}
      >
        <Tab value="pending">Pending Approvals</Tab>
        <Tab value="approved">Approved</Tab>
        <Tab value="rejected">Rejected</Tab>
      </TabList>

      {currentQuery.isPending && <Spinner label="Loading…" />}

      {currentQuery.isError && (
        <MessageBar intent="error">
          <MessageBarBody>Failed to load reservations. Please refresh.</MessageBarBody>
        </MessageBar>
      )}

      {currentQuery.data && (
        <ReservationQueueGrid
          reservations={currentQuery.data}
          onSelect={(r) => setSelectedReservation(r)}
          onBulkApprove={isPending
            ? (list) => { setBulkApproveList(list); setBulkDialogOpen(true); }
            : undefined
          }
        />
      )}

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
