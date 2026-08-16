import { useMutation, useQueryClient } from "@tanstack/react-query";
import { retryAppendForReservation } from "./retryAppendForReservation";

/** Re-run append (AddChildItems) for an approved add-to-existing reservation. */
export function useRetryAppend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reservationId: string }) => retryAppendForReservation(input.reservationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["my-records"] });
      void queryClient.invalidateQueries({ queryKey: ["my-record-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
    },
  });
}
