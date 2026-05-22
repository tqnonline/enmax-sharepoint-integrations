import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approveCheckin } from "../api/checkoutClient";

export function useApproveCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveCheckin,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["checkouts"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
    },
  });
}
