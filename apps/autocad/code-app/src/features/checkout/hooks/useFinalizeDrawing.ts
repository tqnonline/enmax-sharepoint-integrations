import { useMutation, useQueryClient } from "@tanstack/react-query";
import { finalizeDrawing } from "../api/checkoutClient";

export function useFinalizeDrawing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: finalizeDrawing,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["drawing-detail", variables.drawingId] });
      void queryClient.invalidateQueries({ queryKey: ["drawings-search"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
    },
  });
}
