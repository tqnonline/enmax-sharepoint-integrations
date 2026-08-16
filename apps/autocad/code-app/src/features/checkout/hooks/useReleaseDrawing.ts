import { useMutation, useQueryClient } from "@tanstack/react-query";
import { releaseDrawing } from "../api/checkoutClient";

export function useReleaseDrawing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: releaseDrawing,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["drawing-detail", variables.drawingId] });
      void queryClient.invalidateQueries({ queryKey: ["drawings-search"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
    },
  });
}
