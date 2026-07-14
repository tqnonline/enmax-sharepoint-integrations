import { useMutation, useQueryClient } from "@tanstack/react-query";
import { checkOutSheets } from "../api/checkoutClient";

export function useCheckOutSheets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: checkOutSheets,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["checkouts"] });
      void queryClient.invalidateQueries({ queryKey: ["drawing-checkout"] });
      void queryClient.invalidateQueries({ queryKey: ["drawing-sheets"] });
      void queryClient.invalidateQueries({ queryKey: ["sheet-checkouts"] });
      void queryClient.invalidateQueries({ queryKey: ["notification-feed"] });
      void queryClient.invalidateQueries({ queryKey: ["my-records"] });
      void queryClient.invalidateQueries({ queryKey: ["header-search"] });
      void queryClient.invalidateQueries({ queryKey: ["search-page"] });
      void queryClient.invalidateQueries({ queryKey: ["search-documents"] });
    },
  });
}
