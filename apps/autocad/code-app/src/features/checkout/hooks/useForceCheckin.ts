import { useMutation, useQueryClient } from "@tanstack/react-query";
import { forceCheckin } from "../api/checkoutClient";

export function useForceCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: forceCheckin,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["checkouts"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
    },
  });
}
