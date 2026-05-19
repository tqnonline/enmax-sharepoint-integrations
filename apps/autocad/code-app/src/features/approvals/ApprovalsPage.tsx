import { useState } from "react";
import {
  Title2,
  Spinner,
  MessageBar,
  MessageBarBody,
  useToastController,
  Toast,
  ToastTitle,
  Toaster,
} from "@fluentui/react-components";
import { usePendingReservations, type PendingReservation } from "./hooks/usePendingReservations";
import { useApproveReservation } from "./hooks/useApproveReservation";
import { ReservationQueueGrid } from "./ReservationQueueGrid";
import { ReservationDetailPanel } from "./ReservationDetailPanel";
import { BulkApproveDialog } from "./BulkApproveDialog";

const TOASTER_ID = "approvals-toaster";

export function ApprovalsPage() {
  const [selectedReservation, setSelectedReservation] = useState<PendingReservation | null>(null);
  const [bulkApproveList, setBulkApproveList] = useState<PendingReservation[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const pendingQuery   = usePendingReservations();
  const approveMutation = useApproveReservation();
  const { dispatchToast } = useToastController(TOASTER_ID);

  async function handleBulkApprove() {
    let successCount = 0;
    let failCount    = 0;

    for (const reservation of bulkApproveList) {
      try {
        await approveMutation.mutateAsync({
          reservationId: reservation.enmax_acdnreservationid,
          decision: "Approved",
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

  return (
    <div>
      <Toaster toasterId={TOASTER_ID} />
      <Title2 as="h1" style={{ marginBottom: "1.5rem" }}>Approvals Queue</Title2>

      {pendingQuery.isPending && <Spinner label="Loading reservations…" />}

      {pendingQuery.isError && (
        <MessageBar intent="error">
          <MessageBarBody>Failed to load pending reservations. Please refresh.</MessageBarBody>
        </MessageBar>
      )}

      {pendingQuery.data && (
        <ReservationQueueGrid
          reservations={pendingQuery.data}
          onSelect={(r) => setSelectedReservation(r)}
          onBulkApprove={(list) => { setBulkApproveList(list); setBulkDialogOpen(true); }}
        />
      )}

      <ReservationDetailPanel
        reservation={selectedReservation}
        onClose={() => setSelectedReservation(null)}
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
