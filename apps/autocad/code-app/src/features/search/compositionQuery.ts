import type { CompositionMaps } from "../approvals/hooks/useCompositionLookups";
import type { CompositionFilterIds } from "./searchListFilters";
import { emptyComposition } from "./searchListFilters";

export interface MatchingGuids {
  businessIds: string[];
  assetIds: string[];
  unitIds: string[];
  domainIds: string[];
  systemIds: string[];
  kindIds: string[];
  /** True when hyphen segments map positionally to Business→Asset→Unit→Domain→System→Kind. */
  positional?: boolean;
}

function idsForPart(map: Map<string, string>, part: string): string[] {
  if (!part) return [];
  const needle = part.toLowerCase();
  return [...map.entries()]
    .filter(([, code]) => code.toLowerCase().startsWith(needle))
    .map(([id]) => id);
}

function idsContaining(map: Map<string, string>, q: string): string[] {
  const needle = q.toLowerCase();
  return [...map.entries()]
    .filter(([, code]) => code.toLowerCase().includes(needle))
    .map(([id]) => id);
}

/** Resolve a user query to composition GUID groups (header + search page). */
export function matchingGuidsFromQuery(query: string, lookups: CompositionMaps): MatchingGuids | undefined {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return undefined;

  const parts = q.split("-").filter((p) => p.length > 0);
  if (parts.length >= 2 && !looksLikeDocumentNumber(query)) {
    const [p0 = "", p1 = "", p2 = "", p3 = "", p4 = "", p5 = ""] = parts;
    return {
      businessIds: idsForPart(lookups.bizMap, p0),
      assetIds: idsForPart(lookups.assetMap, p1),
      unitIds: idsForPart(lookups.unitMap, p2),
      domainIds: idsForPart(lookups.domainMap, p3),
      systemIds: idsForPart(lookups.sysMap, p4),
      kindIds: idsForPart(lookups.kindMap, p5),
      positional: true,
    };
  }

  return {
    businessIds: idsContaining(lookups.bizMap, q),
    assetIds: idsContaining(lookups.assetMap, q),
    unitIds: idsContaining(lookups.unitMap, q),
    domainIds: idsContaining(lookups.domainMap, q),
    systemIds: idsContaining(lookups.sysMap, q),
    kindIds: idsContaining(lookups.kindMap, q),
  };
}

/** Heuristic: long hyphenated tokens with DD segment are document numbers, not composition-only. */
export function looksLikeDocumentNumber(query: string): boolean {
  const upper = query.trim().toUpperCase();
  if (/-DD-\d{4}/.test(upper)) return true;
  if (/-\d{3}$/.test(upper)) return true;
  return upper.split("-").filter(Boolean).length >= 7;
}

/** Pick the first resolved id per composition field for OData / dropdown filters. */
export function guidsToCompositionFilter(guids?: MatchingGuids): CompositionFilterIds {
  if (!guids) return emptyComposition();
  return {
    businessId: guids.businessIds[0] ?? "",
    assetId: guids.assetIds[0] ?? "",
    unitId: guids.unitIds[0] ?? "",
    domainId: guids.domainIds[0] ?? "",
    systemId: guids.systemIds[0] ?? "",
    kindId: guids.kindIds[0] ?? "",
  };
}

export function compositionSummaryFromIds(
  composition: CompositionFilterIds,
  lookups?: CompositionMaps,
): string {
  if (!lookups) return "";
  const parts = [
    composition.businessId ? lookups.bizMap.get(composition.businessId) : undefined,
    composition.assetId ? lookups.assetMap.get(composition.assetId) : undefined,
    composition.unitId ? lookups.unitMap.get(composition.unitId) : undefined,
    composition.domainId ? lookups.domainMap.get(composition.domainId) : undefined,
    composition.systemId ? lookups.sysMap.get(composition.systemId) : undefined,
    composition.kindId ? lookups.kindMap.get(composition.kindId) : undefined,
  ].filter(Boolean);
  return parts.join("-");
}
