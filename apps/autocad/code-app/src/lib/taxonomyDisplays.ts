const FORMATTED_SUFFIX = "@OData.Community.Display.V1.FormattedValue";

const LOOKUPS = {
  businessDisplay: "_enmax_acdnbusiness_value",
  assetDisplay: "_enmax_acdnasset_value",
  unitDisplay: "_enmax_acdnunit_value",
  domainDisplay: "_enmax_acdndomain_value",
  systemDisplay: "_enmax_acdnsystem_value",
  kindDisplay: "_enmax_acdnkind_value",
} as const;

export interface TaxonomyDisplays {
  businessDisplay: string;
  assetDisplay: string;
  unitDisplay: string;
  domainDisplay: string;
  systemDisplay: string;
  kindDisplay: string;
}

type RawRecord = Record<string, unknown> | undefined;

function readDisplay(raw: RawRecord, lookupField: string): string {
  if (!raw) return "";
  const formatted = raw[`${lookupField}${FORMATTED_SUFFIX}`];
  if (typeof formatted === "string") return formatted;

  const fallback = raw[lookupField];
  if (typeof fallback === "string") {
    return fallback;
  }
  return "";
}

/**
 * Resolve the six WS1a taxonomy display labels from a Dataverse row.
 * When a field is missing on the primary row, the helper falls back to `fallbackRaw`.
 */
export function taxonomyDisplaysFromRaw(
  raw: RawRecord,
  fallbackRaw?: RawRecord,
): TaxonomyDisplays {
  return {
    businessDisplay: readDisplay(raw, LOOKUPS.businessDisplay) || readDisplay(fallbackRaw, LOOKUPS.businessDisplay),
    assetDisplay: readDisplay(raw, LOOKUPS.assetDisplay) || readDisplay(fallbackRaw, LOOKUPS.assetDisplay),
    unitDisplay: readDisplay(raw, LOOKUPS.unitDisplay) || readDisplay(fallbackRaw, LOOKUPS.unitDisplay),
    domainDisplay: readDisplay(raw, LOOKUPS.domainDisplay) || readDisplay(fallbackRaw, LOOKUPS.domainDisplay),
    systemDisplay: readDisplay(raw, LOOKUPS.systemDisplay) || readDisplay(fallbackRaw, LOOKUPS.systemDisplay),
    kindDisplay: readDisplay(raw, LOOKUPS.kindDisplay) || readDisplay(fallbackRaw, LOOKUPS.kindDisplay),
  };
}
