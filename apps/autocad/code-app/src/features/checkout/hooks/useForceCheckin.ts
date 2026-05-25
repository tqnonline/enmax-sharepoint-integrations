import { useMutation, useQueryClient } from "@tanstack/react-query";
import { forceCheckin } from "../api/checkoutClient";

export function useForceCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: forceCheckin,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["drawing", variables.drawingId] });
      void queryClient.invalidateQueries({ queryKey: ["search-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["checkouts"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
    },
  });
}
