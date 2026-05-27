import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitRevision } from "../api/checkoutClient";

export function useSubmitRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitRevision,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["drawing-detail", variables.drawingId] });
      void queryClient.invalidateQueries({ queryKey: ["drawings-search"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["checkouts"] });
    },
  });
}
