import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markObsolete } from "../api/checkoutClient";

export function useMarkObsolete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markObsolete,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["drawing", variables.drawingId] });
      void queryClient.invalidateQueries({ queryKey: ["search-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
    },
  });
}
