import { useMutation, useQueryClient } from "@tanstack/react-query";
import { executeCustomApi } from "../../../lib/executeCustomApi";
import { addChildItems } from "../../reserve/api/addChildItemsClient";
import { Enmax_autocadreservationsService } from "../../../generated";
import type { Enmax_autocadreservationsBase } from "../../../generated/models/Enmax_autocadreservationsModel";
import { issueNumbersForReservation } from "./issueNumbersForReservation";

/** enmax_acdnsequencetype option value for "Existing" (append to a base). */
const SEQUENCE_TYPE_EXISTING = 2;

export interface ApproveInput {
  reservationId: string;
  decision: "Approved" | "Declined";
  reason?: string;
  // Composition codes + count — needed to issue numbers on approve
  businessCode?: string;
  assetCode?: string;
  unitCode?: string;
  domainCode?: string;
  systemCode?: string;
  kindCode?: string;
  drawingCount?: number;
  // Append context (Add-to-existing). When sequenceType is Existing and a target
  // drawing is set, approval appends children to that base instead of issuing new
  // base numbers.
  targetDrawingId?: string;
  sequenceType?: number;
  reservationType?: number;
}

async function invokeApproveAction(input: ApproveInput): Promise<void> {
  if (input.decision === "Approved") {
    // Step 1 — Change status to Approved (plugin also creates audit event)
    const approveResult = await executeCustomApi({
      operationName: "enmax_acdnApproveReservation",
      tableName: "enmax_autocadreservations",
      body: {
        Target: {
          "@odata.type": "Microsoft.Dynamics.CRM.enmax_autocadreservation",
          enmax_autocadreservationid: input.reservationId,
        },
      },
    });

    if (!approveResult.success) {
      const err = approveResult.error as { message?: string } | undefined;
      throw new Error(err?.message ?? "Approve failed");
    }

    // Step 2 — Append to existing base, or issue new base numbers.
    const isAppend = input.sequenceType === SEQUENCE_TYPE_EXISTING && !!input.targetDrawingId;

    if (isAppend) {
      // Append N child items (-sss) to the target base, then stamp the produced
      // range on the reservation so the detail/audit views reflect what was added.
      let appendResult;
      try {
        appendResult = await addChildItems({
          drawingId: input.targetDrawingId!,
          count: input.drawingCount ?? 0,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown error";
        throw new Error(
          `Reservation approved, but appending items failed: ${msg}. ` +
          `No items were added — retry or contact an admin.`,
        );
      }

      const patchResult = await Enmax_autocadreservationsService.update(
        input.reservationId,
        {
          enmax_acdnappendfirst: appendResult.firstChildNumber,
          enmax_acdnappendlast:  appendResult.lastChildNumber,
        } as unknown as Partial<Omit<Enmax_autocadreservationsBase, "enmax_autocadreservationid">>,
      );
      if (!patchResult.success) {
        const err = patchResult.error as { message?: string } | undefined;
        throw new Error(
          `Items appended, but recording the range on the reservation failed: ` +
          `${err?.message ?? "unknown error"}.`,
        );
      }
      return;
    }

    // Issue base numbers — always runs for non-append approvals. Composition is
    // resolved from the reservation record when the approval queue lacks lookup codes.
    try {
      await issueNumbersForReservation(input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      throw new Error(
        `Reservation approved, but number issuance failed: ${msg}. ` +
        `No drawings were created — use Retry on the reservation detail page or contact an admin.`,
      );
    }
  } else {
    // Decline — custom action handles status update + audit event server-side
    const result = await executeCustomApi({
      operationName: "enmax_acdnDeclineReservation",
      tableName: "enmax_autocadreservations",
      body: {
        Target: {
          "@odata.type": "Microsoft.Dynamics.CRM.enmax_autocadreservation",
          enmax_autocadreservationid: input.reservationId,
        },
        Reason: input.reason ?? "",
      },
    });

    if (!result.success) {
      const err = result.error as { message?: string } | undefined;
      throw new Error(err?.message ?? "Decline failed");
    }
  }
}

export function useApproveReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invokeApproveAction,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["my-records"] });
      void queryClient.invalidateQueries({ queryKey: ["my-record-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["notification-feed"] });
    },
  });
}
