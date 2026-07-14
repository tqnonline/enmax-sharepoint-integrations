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
      void queryClient.invalidateQueries({ queryKey: ["drawing-checkout"] });
      void queryClient.invalidateQueries({ queryKey: ["header-search"] });
      void queryClient.invalidateQueries({ queryKey: ["search-page"] });
      void queryClient.invalidateQueries({ queryKey: ["search-documents"] });
    },
  });
}
