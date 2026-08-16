import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addChildItems } from "../api/addChildItemsClient";

export function useAddChildItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addChildItems,
    onSuccess: () => {
      // New child items affect drawing detail, sheet lists, and search rows.
      void queryClient.invalidateQueries({ queryKey: ["drawing-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["drawing-sheets"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
    },
  });
}
