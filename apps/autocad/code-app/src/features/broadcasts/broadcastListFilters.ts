import type { Enmax_autocadbroadcasts } from "../../generated/models/Enmax_autocadbroadcastsModel";
import { inIsoDateRange, matchesOptionalText } from "../../lib/gridListFilters";

export interface BroadcastListFilters {
  number: string;
  from: string;
  to: string;
}

export function applyBroadcastListFilters(
  rows: Enmax_autocadbroadcasts[],
  filters: BroadcastListFilters,
): Enmax_autocadbroadcasts[] {
  return rows.filter((r) => {
    if (!inIsoDateRange(r.enmax_acdnstartsat, filters.from, filters.to)) return false;
    return matchesOptionalText(
      filters.number,
      r.enmax_acdntitle,
      r.enmax_acdnbody,
    );
  });
}
