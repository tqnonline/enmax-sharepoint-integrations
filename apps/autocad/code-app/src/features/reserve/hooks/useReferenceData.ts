import { useQuery } from "@tanstack/react-query";

export interface RefItem {
  id: string;
  code: string;
  name: string;
}

async function fetchTable(entity: string): Promise<RefItem[]> {
  const base = (window as unknown as Record<string, string>).__dataverseBaseUrl ??
    "/api/data/v9.2";
  const res = await fetch(
    `${base}/${entity}?$select=enmax_acdnid,enmax_acdncode,enmax_acdnname&$orderby=enmax_acdncode`,
    { headers: { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } },
  );
  if (!res.ok) throw new Error(`${entity} fetch failed: ${res.status}`);
  const json = await res.json() as { value: Array<{ enmax_acdnid: string; enmax_acdncode: string; enmax_acdnname: string }> };
  return json.value.map((r) => ({ id: r.enmax_acdnid, code: r.enmax_acdncode, name: r.enmax_acdnname }));
}

export interface ReferenceData {
  businesses: RefItem[];
  assets:     RefItem[];
  units:      RefItem[];
  domains:    RefItem[];
  systems:    RefItem[];
  kinds:      RefItem[];
}

export function useReferenceData() {
  return useQuery<ReferenceData>({
    queryKey: ["reference-data"],
    queryFn: async () => {
      const [businesses, assets, units, domains, systems, kinds] = await Promise.all([
        fetchTable("enmax_autocadbusinesses"),
        fetchTable("enmax_autocadassets"),
        fetchTable("enmax_autocadunits"),
        fetchTable("enmax_autocaddomains"),
        fetchTable("enmax_autocadsystems"),
        fetchTable("enmax_autocadkinds"),
      ]);
      return { businesses, assets, units, domains, systems, kinds };
    },
    staleTime: 5 * 60 * 1000,
  });
}
