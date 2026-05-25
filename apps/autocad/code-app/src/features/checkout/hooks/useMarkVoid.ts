import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markVoid } from "../api/checkoutClient";

export function useMarkVoid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markVoid,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["drawing", variables.drawingId] });
      void queryClient.invalidateQueries({ queryKey: ["search-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
    },
  });
}
