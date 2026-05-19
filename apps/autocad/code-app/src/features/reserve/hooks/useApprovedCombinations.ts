import { useQuery } from "@tanstack/react-query";

export interface ApprovedBusinessAsset {
  businessId: string;
  assetId: string;
}

export interface AssetUnit {
  assetId: string;
  unitId: string;
}

export interface SystemScope {
  systemId: string;
  scopeType: "AssetOnly" | "DomainOnly" | "Global";
  scopeValue: string;
}

export interface ApprovedCombinations {
  businessAssets: ApprovedBusinessAsset[];
  assetUnits:     AssetUnit[];
  systemScopes:   SystemScope[];
}

async function fetchApprovedCombinations(): Promise<ApprovedCombinations> {
  const base = (window as unknown as Record<string, string>).__dataverseBaseUrl ??
    "/api/data/v9.2";

  const [baRes, auRes, ssRes] = await Promise.all([
    fetch(`${base}/enmax_autocadbusinessassets?$select=_enmax_acdnbusiness_value,_enmax_acdnasset_value`,
      { headers: { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } }),
    fetch(`${base}/enmax_autocadassetunits?$select=_enmax_acdnasset_value,_enmax_acdnunit_value`,
      { headers: { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } }),
    fetch(`${base}/enmax_autocadsystemscopes?$select=_enmax_acdnsystem_value,enmax_acdnscopetype,enmax_acdnscopevalue`,
      { headers: { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } }),
  ]);

  if (!baRes.ok || !auRes.ok || !ssRes.ok) {
    throw new Error("Approved combinations fetch failed");
  }

  const SCOPE_MAP: Record<number, SystemScope["scopeType"]> = { 1: "AssetOnly", 2: "DomainOnly", 3: "Global" };

  const [ba, au, ss] = await Promise.all([
    baRes.json() as Promise<{ value: Array<{ _enmax_acdnbusiness_value: string; _enmax_acdnasset_value: string }> }>,
    auRes.json() as Promise<{ value: Array<{ _enmax_acdnasset_value: string; _enmax_acdnunit_value: string }> }>,
    ssRes.json() as Promise<{ value: Array<{ _enmax_acdnsystem_value: string; enmax_acdnscopetype: number; enmax_acdnscopevalue: string }> }>,
  ]);

  return {
    businessAssets: ba.value.map((r) => ({ businessId: r._enmax_acdnbusiness_value, assetId: r._enmax_acdnasset_value })),
    assetUnits:     au.value.map((r) => ({ assetId: r._enmax_acdnasset_value, unitId: r._enmax_acdnunit_value })),
    systemScopes:   ss.value.map((r) => ({
      systemId:   r._enmax_acdnsystem_value,
      scopeType:  SCOPE_MAP[r.enmax_acdnscopetype] ?? "Global",
      scopeValue: r.enmax_acdnscopevalue,
    })),
  };
}

export function useApprovedCombinations() {
  return useQuery<ApprovedCombinations>({
    queryKey: ["approved-combinations"],
    queryFn: fetchApprovedCombinations,
    staleTime: 5 * 60 * 1000,
  });
}

export function filterAssetsByBusiness(
  allAssets: Array<{ id: string; code: string; name: string }>,
  businessId: string,
  combos: ApprovedCombinations,
): Array<{ id: string; code: string; name: string }> {
  const approved = new Set(
    combos.businessAssets
      .filter((c) => c.businessId === businessId)
      .map((c) => c.assetId),
  );
  return allAssets.filter((a) => approved.has(a.id));
}

export function filterUnitsByAsset(
  allUnits: Array<{ id: string; code: string; name: string }>,
  assetId: string,
  combos: ApprovedCombinations,
): Array<{ id: string; code: string; name: string }> {
  const approved = new Set(
    combos.assetUnits
      .filter((c) => c.assetId === assetId)
      .map((c) => c.unitId),
  );
  return allUnits.filter((u) => approved.has(u.id));
}

export function filterSystemsByAssetAndDomain(
  allSystems: Array<{ id: string; code: string; name: string }>,
  assetCode: string,
  domainCode: string,
  combos: ApprovedCombinations,
): Array<{ id: string; code: string; name: string }> {
  const restrictedIds = new Set(
    combos.systemScopes
      .filter((s) => {
        if (s.scopeType === "AssetOnly")  return s.scopeValue !== assetCode;
        if (s.scopeType === "DomainOnly") return s.scopeValue !== domainCode;
        return false;
      })
      .map((s) => s.systemId),
  );
  return allSystems.filter((s) => !restrictedIds.has(s.id));
}

export function isBusinessAssetApproved(
  businessId: string,
  assetId: string,
  combos: ApprovedCombinations,
): boolean {
  return combos.businessAssets.some(
    (c) => c.businessId === businessId && c.assetId === assetId,
  );
}
