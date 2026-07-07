import { useMutation, useQueryClient } from "@tanstack/react-query";
import { checkOut } from "../api/checkoutClient";

export function useCheckOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: checkOut,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["checkouts"] });
      // WS3: a gated Check Out creates a Requested checkout; refresh the per-drawing
      // checkout so the "pending approval" badge appears without a manual reload.
      void queryClient.invalidateQueries({ queryKey: ["drawing-checkout"] });
    },
  });
}
