import { useQuery } from "@tanstack/react-query";
import { Enmax_autocaddrawingsService } from "../../../generated";

export interface ExistingBase {
  id: string;
  number: string;
  title: string;
  childCount: number;
  state: number;
  /** Segment GUIDs — used to seed a next-base reservation for Standard docs. */
  business: string;
  asset: string;
  unit: string;
  domain: string;
  system: string;
  kind: string;
}

// Terminal states that should not accept "add to existing" (obsolete/void/superseded).
const TERMINAL_STATES = [5, 6, 7];

/**
 * Searches issued base numbers (enmax_autocaddrawing) by coding/number substring
 * (ADR 0001 #6 / requirement #10). Matching is a case-insensitive `contains` on the
 * full number, mirroring the drawing search. Terminal-state numbers are excluded.
 */
export function useSearchExistingBases(query: string, enabled = true) {
  const q = query.trim();
  return useQuery<ExistingBase[]>({
    queryKey: ["existing-bases", q],
    enabled: enabled && q.length >= 2,
    staleTime: 15_000,
    throwOnError: false,
    queryFn: async () => {
      const safe = q.replace(/'/g, "''");
      const stateFilter = TERMINAL_STATES.map((s) => `enmax_acdnstate ne ${s}`).join(" and ");
      const result = await Enmax_autocaddrawingsService.getAll({
        filter: `contains(enmax_acdnnumber,'${safe}') and (${stateFilter})`,
        select: [
          "enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdntitle",
          "enmax_acdnsheetcount", "enmax_acdnstate",
          "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
          "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
        ],
        orderBy: ["enmax_acdnnumber asc"],
        top: 25,
      });
      if (!result.success || !result.data) return [];
      return result.data.map((r) => ({
        id:         r.enmax_autocaddrawingid,
        number:     r.enmax_acdnnumber ?? "",
        title:      r.enmax_acdntitle ?? "",
        childCount: r.enmax_acdnsheetcount ?? 0,
        state:      r.enmax_acdnstate ?? 0,
        business:   r["_enmax_acdnbusiness_value"] ?? "",
        asset:      r["_enmax_acdnasset_value"] ?? "",
        unit:       r["_enmax_acdnunit_value"] ?? "",
        domain:     r["_enmax_acdndomain_value"] ?? "",
        system:     r["_enmax_acdnsystem_value"] ?? "",
        kind:       r["_enmax_acdnkind_value"] ?? "",
      }));
    },
  });
}
