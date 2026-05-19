import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ApproveInput {
  reservationId: string;
  decision: "Approved" | "Declined";
  reason?: string;
}

async function invokeApproveAction(input: ApproveInput): Promise<void> {
  const base = (window as unknown as Record<string, string>).__dataverseBaseUrl ??
    "/api/data/v9.2";

  const body: Record<string, unknown> = { Decision: input.decision === "Approved" ? 2 : 3 };
  if (input.decision === "Declined" && input.reason) {
    body["Reason"] = input.reason;
  }

  const res = await fetch(
    `${base}/enmax_autocadreservations(${input.reservationId})/Microsoft.Dynamics.CRM.enmax_acdnApproveReservation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw Object.assign(new Error(`ApproveReservation failed: ${res.status}`), { status: res.status, detail: err });
  }
}

export function useApproveReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invokeApproveAction,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pending-reservations"] });
    },
  });
}
