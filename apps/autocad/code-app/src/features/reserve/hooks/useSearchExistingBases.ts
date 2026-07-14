import { useQuery } from "@tanstack/react-query";
import { Enmax_autocaddrawingsService } from "../../../generated";
import type { ReserveForm } from "../schema";
import { taxonomyFilterClause } from "../taxonomyFilters";

export interface ExistingBase {
  id: string;
  number: string;
  title: string;
  childCount: number;
  state: number;
  reservationType?: number;
  documentSubtype?: number;
  /** Segment GUIDs — used to seed a next-base reservation for Standard docs. */
  business: string;
  asset: string;
  unit: string;
  domain: string;
  system: string;
  kind: string;
  /** Readable segment labels (Dataverse formatted values) for the base grid columns. */
  businessDisplay: string;
  assetDisplay: string;
  unitDisplay: string;
  domainDisplay: string;
  systemDisplay: string;
  kindDisplay: string;
}

// Terminal states that should not accept "add to existing" (obsolete/void/superseded).
// Pending SharePoint Import (8) is not yet approved and must not be addable either.
const TERMINAL_STATES = [5, 6, 7, 8];

/**
 * Searches issued base numbers (enmax_autocaddrawing) by coding/number substring,
 * scoped to the selected reservation taxonomy (Drawing / Standard / Procedure).
 */
export function useSearchExistingBases(
  query: string,
  reservationType: ReserveForm["reservationType"],
  documentSubtype: ReserveForm["documentSubtype"],
  enabled = true,
) {
  const q = query.trim();
  const typeClause = taxonomyFilterClause(reservationType, documentSubtype);
  return useQuery<ExistingBase[]>({
    queryKey: ["existing-bases", q, reservationType, documentSubtype ?? ""],
    enabled: enabled && q.length >= 2,
    staleTime: 15_000,
    throwOnError: false,
    queryFn: async () => {
      const safe = q.replace(/'/g, "''");
      const stateFilter = TERMINAL_STATES.map((s) => `enmax_acdnstate ne ${s}`).join(" and ");
      const result = await Enmax_autocaddrawingsService.getAll({
        filter: `contains(enmax_acdnnumber,'${safe}') and (${stateFilter}) and ${typeClause}`,
        select: [
          "enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdntitle",
          "enmax_acdnsheetcount", "enmax_acdnstate",
          "enmax_acdnreservationtype", "enmax_acdndocumentsubtype",
          "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
          "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
        ],
        orderBy: ["enmax_acdnnumber asc"],
        top: 25,
      });
      if (!result.success || !result.data) return [];
      return result.data.map((row) => {
        const r = row as unknown as Record<string, unknown>;
        const fv = (k: string) =>
          (r[`${k}@OData.Community.Display.V1.FormattedValue`] as string) ?? "";
        const str = (k: string) => (r[k] as string | undefined) ?? "";
        return {
          id:         str("enmax_autocaddrawingid"),
          number:     str("enmax_acdnnumber"),
          title:      str("enmax_acdntitle"),
          childCount: (r["enmax_acdnsheetcount"] as number | undefined) ?? 0,
          state:      (r["enmax_acdnstate"] as number | undefined) ?? 0,
          reservationType: (r["enmax_acdnreservationtype"] as number | undefined) ?? undefined,
          documentSubtype: (r["enmax_acdndocumentsubtype"] as number | undefined) ?? undefined,
          business:   str("_enmax_acdnbusiness_value"),
          asset:      str("_enmax_acdnasset_value"),
          unit:       str("_enmax_acdnunit_value"),
          domain:     str("_enmax_acdndomain_value"),
          system:     str("_enmax_acdnsystem_value"),
          kind:       str("_enmax_acdnkind_value"),
          businessDisplay: fv("_enmax_acdnbusiness_value"),
          assetDisplay:    fv("_enmax_acdnasset_value"),
          unitDisplay:     fv("_enmax_acdnunit_value"),
          domainDisplay:   fv("_enmax_acdndomain_value"),
          systemDisplay:   fv("_enmax_acdnsystem_value"),
          kindDisplay:     fv("_enmax_acdnkind_value"),
        };
      });
    },
  });
}
