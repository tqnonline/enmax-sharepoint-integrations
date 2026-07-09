import { useMutation, useQueryClient } from "@tanstack/react-query";
import { issueNumbersForReservation } from "./issueNumbersForReservation";
import type { IssueNumbersReservationInput } from "./issueNumbersForReservation";

/** Re-run number issuance for an approved reservation that never received issued numbers. */
export function useRetryIssueNumbers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<IssueNumbersReservationInput, "reservationId">) =>
      issueNumbersForReservation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["my-records"] });
      void queryClient.invalidateQueries({ queryKey: ["my-record-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
    },
  });
}
