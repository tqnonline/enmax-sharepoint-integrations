import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../../../.power/schemas/appschemas/dataSourcesInfo";

const client = getClient(dataSourcesInfo);

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
}

async function invokeApproveAction(input: ApproveInput): Promise<void> {
  if (input.decision === "Approved") {
    // Step 1 — Change status to Approved (plugin also creates audit event)
    const approveResult = await client.executeAsync<Record<string, unknown>, unknown>({
      dataverseRequest: {
        action: "customapi",
        parameters: {
          operationName: "enmax_acdnApproveReservation",
          tableName: "enmax_autocadreservations",
          body: {
            Target: {
              "@odata.type": "Microsoft.Dynamics.CRM.enmax_autocadreservation",
              enmax_autocadreservationid: input.reservationId,
            },
          },
        },
      },
    });

    if (!approveResult.success) {
      const err = approveResult.error as { message?: string } | undefined;
      throw new Error(err?.message ?? "Approve failed");
    }

    // Step 2 — Issue drawing numbers (requires all 6 composition codes)
    const { businessCode, assetCode, unitCode, domainCode, systemCode, kindCode, drawingCount } = input;

    if (businessCode && assetCode && unitCode && domainCode && systemCode && kindCode && drawingCount) {
      const issueResult = await client.executeAsync<Record<string, unknown>, Record<string, unknown>>({
        dataverseRequest: {
          action: "customapi",
          parameters: {
            operationName: "enmax_acdnIssueNumbers",
            tableName: "enmax_acdnissuenumbers",
            body: {
              Business:    businessCode,
              Asset:       assetCode,
              Unit:        unitCode,
              Domain:      domainCode,
              System:      systemCode,
              Kind:        kindCode,
              Count:       drawingCount,
              // Unbound Custom API EntityReference param — must use the @odata.id
              // binding, NOT the @odata.type+pk Entity shape. The Entity shape does
              // not bind to an EntityReference param, so IssueNumbers never stamps
              // issuednumbers onto the reservation and AutoCreateDrawings never fires
              // (drawings silently fail to appear after approval).
              Reservation: {
                "@odata.id": `enmax_autocadreservations(${input.reservationId})`,
              },
            },
          },
        },
      });

      if (!issueResult.success) {
        console.error("[IssueNumbers] failed:", issueResult.error);
      }
      // Number issuance failure is non-fatal — approval already succeeded
    }
  } else {
    // Decline — custom action handles status update + audit event server-side
    const result = await client.executeAsync<Record<string, unknown>, unknown>({
      dataverseRequest: {
        action: "customapi",
        parameters: {
          operationName: "enmax_acdnDeclineReservation",
          tableName: "enmax_autocadreservations",
          body: {
            Target: {
              "@odata.type": "Microsoft.Dynamics.CRM.enmax_autocadreservation",
              enmax_autocadreservationid: input.reservationId,
            },
            Reason: input.reason ?? "",
          },
        },
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
    },
  });
}
