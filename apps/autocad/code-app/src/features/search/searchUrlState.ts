import { defaultGridDateRange } from "../../lib/dateRangeDefaults";
import type { ReferenceData } from "../reserve/hooks/useReferenceData";
import type { CompositionFilterIds, DocumentSubtypeSearchFilter, SearchListFilters, SearchTab } from "./searchListFilters";
import { emptyComposition } from "./searchListFilters";

export type HeaderSearchTab = "all" | SearchTab;

const COMPOSITION_KEYS: (keyof CompositionFilterIds)[] = [
  "businessId",
  "assetId",
  "unitId",
  "domainId",
  "systemId",
  "kindId",
];

export function parseSearchTab(raw: string | null): SearchTab {
  if (raw === "documents") return "documents";
  // Legacy ?tab=reservations bookmarks fall back to Drawings.
  return "drawings";
}

export function parseHeaderSearchTab(raw: string | null): HeaderSearchTab {
  // Header search is documents/drawings only — never RES-#### reservation lookup.
  if (raw === "documents" || raw === "drawings") return raw;
  return "all";
}

function compositionFromParams(params: URLSearchParams): CompositionFilterIds {
  const composition = emptyComposition();
  for (const key of COMPOSITION_KEYS) {
    const val = params.get(key);
    if (val) composition[key] = val;
  }
  return composition;
}

function compositionFromRefCodes(
  params: URLSearchParams,
  refData: ReferenceData,
): CompositionFilterIds {
  const findId = (items: { id: string; code: string }[], code: string | null) => {
    if (!code) return "";
    const hit = items.find((i) => i.code.toLowerCase() === code.toLowerCase());
    return hit?.id ?? "";
  };
  return {
    businessId: findId(refData.businesses, params.get("business")),
    assetId: findId(refData.assets, params.get("asset")),
    unitId: findId(refData.units, params.get("unit")),
    domainId: findId(refData.domains, params.get("domain")),
    systemId: findId(refData.systems, params.get("system")),
    kindId: findId(refData.kinds, params.get("kind")),
  };
}

export function filtersFromSearchParams(
  params: URLSearchParams,
  refData?: ReferenceData,
  fromDays?: number,
): SearchListFilters {
  const { from, to } = defaultGridDateRange(new Date(), fromDays);
  const subtypeRaw = params.get("subtype");
  const documentSubtype: DocumentSubtypeSearchFilter =
    subtypeRaw === "standard" || subtypeRaw === "procedure" || subtypeRaw === "form"
      ? subtypeRaw
      : "all";

  const byId = compositionFromParams(params);
  const hasIdComposition = COMPOSITION_KEYS.some((k) => byId[k]);
  const composition = hasIdComposition
    ? byId
    : (refData ? compositionFromRefCodes(params, refData) : emptyComposition());

  return {
    number: params.get("q") ?? "",
    from,
    to,
    documentSubtype,
    documentStatus: "all",
    peopleIds: [],
    composition,
  };
}

export function hasSearchPrefill(params: URLSearchParams): boolean {
  if (params.get("q")) return true;
  if (COMPOSITION_KEYS.some((k) => params.get(k))) return true;
  return ["business", "asset", "unit", "domain", "system", "kind"].some((k) => params.get(k));
}

export function buildSearchPageUrl(opts: {
  q?: string;
  tab?: HeaderSearchTab;
  composition?: CompositionFilterIds;
  subtype?: DocumentSubtypeSearchFilter;
}): string {
  const p = new URLSearchParams();
  const q = opts.q?.trim();
  if (q) p.set("q", q);
  if (opts.tab && opts.tab !== "all") p.set("tab", opts.tab);
  if (opts.subtype && opts.subtype !== "all") p.set("subtype", opts.subtype);
  if (opts.composition) {
    for (const key of COMPOSITION_KEYS) {
      const val = opts.composition[key];
      if (val) p.set(key, val);
    }
  }
  const qs = p.toString();
  return qs ? `/search?${qs}` : "/search";
}

export function buildDocumentDetailUrl(opts: {
  documentId: string;
  drawingId: string;
  tab?: SearchTab;
  returnTo: string;
}): string {
  const p = new URLSearchParams({
    drawingId: opts.drawingId,
    tab: opts.tab ?? "drawings",
    returnTo: opts.returnTo,
  });
  return `/search/documents/${opts.documentId}?${p.toString()}`;
}

/** Full-bleed page listing all child documents on a parent drawing/record. */
export function buildDrawingFamilyPageUrl(opts: {
  drawingId: string;
  returnTo?: string;
  tab?: SearchTab;
}): string {
  return buildDocumentDetailUrl({
    documentId: opts.drawingId,
    drawingId: opts.drawingId,
    tab: opts.tab ?? "drawings",
    returnTo: opts.returnTo ?? "/my-items",
  });
}
