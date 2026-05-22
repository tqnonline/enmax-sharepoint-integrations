import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "../../../auth/useCurrentUser";
import { Enmax_autocaddrawingsService } from "../../../generated/services/Enmax_autocaddrawingsService";
import { Enmax_autocadcheckoutsService } from "../../../generated/services/Enmax_autocadcheckoutsService";
import {
  CheckoutStatus,
  type DrawingForPanel,
  type DrawingStateValue,
  type CheckoutForPanel,
} from "../api/checkoutClient";

export interface CheckedOutDrawingRow {
  drawing: DrawingForPanel;
  checkout: CheckoutForPanel;
  reservationId?: string;
}

async function fetchMyCheckedOutDrawings(userId: string): Promise<CheckedOutDrawingRow[]> {
  const checkoutsResult = await Enmax_autocadcheckoutsService.getAll({
    filter: `_enmax_acdncheckedoutby_value eq '${userId}' and enmax_acdnstatus eq ${CheckoutStatus.Open}`,
    select: [
      "enmax_autocadcheckoutid",
      "_enmax_acdndrawing_value",
      "_enmax_acdncheckedoutby_value",
      "enmax_acdnstatus",
      "enmax_acdnnewrevision",
      "enmax_acdnnewpdfurls",
    ],
  });

  if (!checkoutsResult.success || !checkoutsResult.data?.length) return [];

  const drawingIds = [
    ...new Set(
      checkoutsResult.data
        .map((c) => c._enmax_acdndrawing_value)
        .filter((id): id is string => !!id),
    ),
  ];
  if (!drawingIds.length) return [];

  const drawingsResult = await Enmax_autocaddrawingsService.getAll({
    filter: drawingIds.map((id) => `enmax_autocaddrawingid eq '${id}'`).join(" or "),
    select: [
      "enmax_autocaddrawingid",
      "enmax_acdnnumber",
      "enmax_acdnstate",
      "enmax_acdnsplibraryurl",
      "enmax_acdncurrentrevision",
      "enmax_acdnmissingsheets",
      "_enmax_acdnreservation_value",
    ],
  });

  const drawingMap = new Map(drawingsResult.data?.map((d) => [d.enmax_autocaddrawingid, d]) ?? []);

  return checkoutsResult.data.map((c) => {
    const d = drawingMap.get(c._enmax_acdndrawing_value ?? "");
    return {
      drawing: {
        id: d?.enmax_autocaddrawingid ?? "",
        state: (d?.enmax_acdnstate ?? 2) as DrawingStateValue,
        number: d?.enmax_acdnnumber,
        spLibraryUrl: d?.enmax_acdnsplibraryurl,
        currentRevision: d?.enmax_acdncurrentrevision,
        missingSheets: d?.enmax_acdnmissingsheets,
      },
      checkout: {
        id: c.enmax_autocadcheckoutid,
        checkedOutBy: c._enmax_acdncheckedoutby_value,
        newRevision: c.enmax_acdnnewrevision,
        newPdfUrls: c.enmax_acdnnewpdfurls,
      },
      reservationId: d?._enmax_acdnreservation_value ?? undefined,
    };
  });
}

export function useMyCheckedOutDrawings() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["checkouts", "my", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchMyCheckedOutDrawings(user!.id),
    refetchInterval: 30_000,
    throwOnError: false,
  });
}
