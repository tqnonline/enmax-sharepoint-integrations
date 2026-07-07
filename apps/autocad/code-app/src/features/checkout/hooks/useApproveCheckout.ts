import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approveCheckout } from "../api/checkoutClient";

/**
 * WS3 gated Check Out: approve or decline a Requested checkout. On approve the drawing
 * becomes CheckedOut and the requester can upload/Check In; on decline it stays Available.
 */
export function useApproveCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveCheckout,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["checkins-all"] });
      void queryClient.invalidateQueries({ queryKey: ["drawing-checkout"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["checkouts"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
    },
  });
}
