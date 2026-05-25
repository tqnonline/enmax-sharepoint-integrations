import { useQuery } from "@tanstack/react-query";
import { Enmax_autocadcheckoutsService } from "../../../generated";
import type { CheckoutForPanel } from "../api/checkoutClient";
import { CheckoutStatus } from "../api/checkoutClient";

export function useDrawingCheckout(drawingId?: string) {
  return useQuery<CheckoutForPanel | undefined>({
    queryKey: ["drawing-checkout", drawingId],
    enabled: !!drawingId,
    staleTime: 30_000,
    queryFn: async () => {
      const result = await Enmax_autocadcheckoutsService.getAll({
        filter: `_enmax_acdndrawing_value eq '${drawingId}' and (enmax_acdnstatus eq ${CheckoutStatus.Open} or enmax_acdnstatus eq ${CheckoutStatus.AwaitingValidation})`,
        select: [
          "enmax_autocadcheckoutid",
          "_ownerid_value",
          "enmax_acdncheckedouton",
          "enmax_acdnnewrevision",
          "enmax_acdnnewpdfurls",
        ],
        top: 1,
      });
      const row = result.data?.[0];
      if (!row) return undefined;
      const raw = row as unknown as Record<string, unknown>;
      return {
        id:           row.enmax_autocadcheckoutid as string,
        checkedOutBy: raw["_ownerid_value"] as string | undefined,
        checkedOutOn: raw["enmax_acdncheckedouton"] as string | undefined,
        newRevision:  raw["enmax_acdnnewrevision"] as string | undefined,
        newPdfUrls:   raw["enmax_acdnnewpdfurls"] as string | undefined,
      } satisfies CheckoutForPanel;
    },
  });
}
