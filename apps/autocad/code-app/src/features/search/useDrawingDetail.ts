import { useQuery } from "@tanstack/react-query";
import { Enmax_autocaddrawingsService } from "../../generated";
import type { DrawingRow } from "./useSearchDrawings";

export function useDrawingDetail(id?: string) {
  return useQuery<DrawingRow | null>({
    queryKey: ["drawing-detail", id],
    enabled: !!id,
    staleTime: 30_000,
    throwOnError: false,
    queryFn: async () => {
      const result = await Enmax_autocaddrawingsService.getAll({
        filter: `enmax_autocaddrawingid eq '${id}'`,
        select: [
          "enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdntitle",
          "enmax_acdncurrentrevision", "enmax_acdnrevisiondate", "enmax_acdnstate",
          "enmax_acdnsheetcount", "enmax_acdnsplibraryurl", "enmax_acdnspdestinationurl",
          "enmax_acdnpresentindropoff", "enmax_acdnpresentindestination",
          "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
          "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
          "_enmax_acdnrecordtype_value", "_enmax_acdnrecordphase_value",
          "_enmax_acdnvendor_value", "_createdby_value",
        ],
        top: 1,
      });
      if (!result.success || !result.data?.length) return null;
      const r = result.data[0] as unknown as Record<string, unknown>;
      const fv = (k: string) =>
        (r[`${k}@OData.Community.Display.V1.FormattedValue`] as string) ?? "";
      return {
        id:                          r["enmax_autocaddrawingid"] as string,
        enmax_acdnnumber:            (r["enmax_acdnnumber"] as string | undefined) ?? "",
        enmax_acdntitle:             (r["enmax_acdntitle"] as string | undefined) ?? "",
        enmax_acdncurrentrevision:   (r["enmax_acdncurrentrevision"] as string | undefined) ?? "",
        enmax_acdnrevisiondate:      (r["enmax_acdnrevisiondate"] as string | undefined) ?? "",
        enmax_acdnstate:             (r["enmax_acdnstate"] as number | undefined) ?? 1,
        enmax_acdnsheetcount:        (r["enmax_acdnsheetcount"] as number | undefined) ?? 0,
        enmax_acdnsplibraryurl:      (r["enmax_acdnsplibraryurl"] as string | undefined) ?? "",
        enmax_acdnspdestinationurl:  (r["enmax_acdnspdestinationurl"] as string | undefined) ?? "",
        enmax_acdnpresentindropoff:  (r["enmax_acdnpresentindropoff"] as boolean | undefined) ?? false,
        enmax_acdnpresentindestination: (r["enmax_acdnpresentindestination"] as boolean | undefined) ?? false,
        _enmax_acdnbusiness_value:   (r["_enmax_acdnbusiness_value"] as string | undefined) ?? "",
        _enmax_acdnasset_value:      (r["_enmax_acdnasset_value"] as string | undefined) ?? "",
        _enmax_acdnunit_value:       (r["_enmax_acdnunit_value"] as string | undefined) ?? "",
        _enmax_acdndomain_value:     (r["_enmax_acdndomain_value"] as string | undefined) ?? "",
        _enmax_acdnsystem_value:     (r["_enmax_acdnsystem_value"] as string | undefined) ?? "",
        _enmax_acdnkind_value:       (r["_enmax_acdnkind_value"] as string | undefined) ?? "",
        _enmax_acdnrecordtype_value: (r["_enmax_acdnrecordtype_value"] as string | undefined) ?? "",
        _enmax_acdnrecordphase_value:(r["_enmax_acdnrecordphase_value"] as string | undefined) ?? "",
        _enmax_acdnvendor_value:     (r["_enmax_acdnvendor_value"] as string | undefined) ?? "",
        _createdby_value:            (r["_createdby_value"] as string | undefined) ?? "",
        businessDisplay:    fv("_enmax_acdnbusiness_value"),
        assetDisplay:       fv("_enmax_acdnasset_value"),
        unitDisplay:        fv("_enmax_acdnunit_value"),
        domainDisplay:      fv("_enmax_acdndomain_value"),
        systemDisplay:      fv("_enmax_acdnsystem_value"),
        kindDisplay:        fv("_enmax_acdnkind_value"),
        recordTypeDisplay:  fv("_enmax_acdnrecordtype_value"),
        recordPhaseDisplay: fv("_enmax_acdnrecordphase_value"),
        vendorDisplay:      fv("_enmax_acdnvendor_value"),
        requesterDisplay:   fv("_createdby_value"),
      } satisfies DrawingRow;
    },
  });
}
