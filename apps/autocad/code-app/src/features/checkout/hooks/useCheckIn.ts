import { useMutation, useQueryClient } from "@tanstack/react-query";
import { checkIn } from "../api/checkoutClient";

export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: checkIn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["checkouts"] });
    },
  });
}
