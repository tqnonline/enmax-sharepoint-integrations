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
      // WS3: include Requested(6) so the gated "pending approval" state is visible to the UI
      // while the drawing itself is still Available.
      const result = await Enmax_autocadcheckoutsService.getAll({
        filter: `_enmax_acdndrawing_value eq '${drawingId}' and (enmax_acdnstatus eq ${CheckoutStatus.Requested} or enmax_acdnstatus eq ${CheckoutStatus.Open} or enmax_acdnstatus eq ${CheckoutStatus.AwaitingValidation})`,
        select: [
          "enmax_autocadcheckoutid",
          "_ownerid_value",
          "enmax_acdnstatus",
          "enmax_acdncheckedouton",
          "enmax_acdnsubmissioninfo",
          "enmax_acdnnewpdfurls",
        ],
        orderBy: ["enmax_acdncheckedouton desc"],
        top: 1,
      });
      const row = result.data?.[0];
      if (!row) return undefined;
      const raw = row as unknown as Record<string, unknown>;
      return {
        id:             row.enmax_autocadcheckoutid as string,
        status:         raw["enmax_acdnstatus"] as number | undefined,
        checkedOutBy:   raw["_ownerid_value"] as string | undefined,
        checkedOutOn:   raw["enmax_acdncheckedouton"] as string | undefined,
        submissionInfo: raw["enmax_acdnsubmissioninfo"] as string | undefined,
        newPdfUrls:     raw["enmax_acdnnewpdfurls"] as string | undefined,
      } satisfies CheckoutForPanel;
    },
  });
}
