// ADR 0001 #4: combination tables are RETAINED READ-ONLY for historical rows and the
// Phase 3 anomaly report only. The reserve wizard no longer gates on them — the six
// segments are independent. These data/filter helpers stay for reporting/admin use.
import { useQuery } from "@tanstack/react-query";
import {
  Enmax_autocadbusinessassetsService,
  Enmax_autocadassetunitsService,
  Enmax_autocadsystemscopesService,
} from "../../../generated";

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

const SCOPE_MAP: Record<number, SystemScope["scopeType"]> = { 1: "AssetOnly", 2: "DomainOnly", 3: "Global" };

export function useApprovedCombinations() {
  return useQuery<ApprovedCombinations>({
    queryKey: ["approved-combinations"],
    queryFn: async () => {
      const [ba, au, ss] = await Promise.all([
        Enmax_autocadbusinessassetsService.getAll({ select: ['enmax_autocadbusinessassetid', '_enmax_acdnbusiness_value', '_enmax_acdnasset_value'], filter: 'statecode eq 0' }),
        Enmax_autocadassetunitsService.getAll({ select: ['enmax_autocadassetunitid', '_enmax_acdnasset_value', '_enmax_acdnunit_value'], filter: 'statecode eq 0' }),
        Enmax_autocadsystemscopesService.getAll({ select: ['enmax_autocadsystemscopeid', '_enmax_acdnsystem_value', 'enmax_acdnscopetype', 'enmax_acdnscopevalue'], filter: 'statecode eq 0' }),
      ]);

      if (!ba.success) throw new Error('businessassets fetch failed');
      if (!au.success) throw new Error('assetunits fetch failed');
      if (!ss.success) throw new Error('systemscopes fetch failed');

      return {
        businessAssets: ba.data!
          .filter(r => r._enmax_acdnbusiness_value && r._enmax_acdnasset_value)
          .map(r => ({ businessId: r._enmax_acdnbusiness_value!, assetId: r._enmax_acdnasset_value! })),
        assetUnits: au.data!
          .filter(r => r._enmax_acdnasset_value && r._enmax_acdnunit_value)
          .map(r => ({ assetId: r._enmax_acdnasset_value!, unitId: r._enmax_acdnunit_value! })),
        systemScopes: ss.data!
          .filter(r => r._enmax_acdnsystem_value)
          .map(r => ({
            systemId:   r._enmax_acdnsystem_value!,
            scopeType:  SCOPE_MAP[r.enmax_acdnscopetype ?? 3] ?? "Global",
            scopeValue: r.enmax_acdnscopevalue ?? '',
          })),
      };
    },
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
