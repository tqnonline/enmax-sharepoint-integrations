import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitRevision } from "../api/checkoutClient";

export function useSubmitRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitRevision,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["checkouts"] });
    },
  });
}
