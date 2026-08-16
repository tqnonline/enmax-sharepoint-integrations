import { useQuery } from "@tanstack/react-query";
import {
  Enmax_autocadbusinessesService,
  Enmax_autocadassetsService,
  Enmax_autocadunitsService,
  Enmax_autocaddomainsService,
  Enmax_autocadsystemsService,
  Enmax_autocadkindsService,
} from "../../../generated";

export interface CompositionMaps {
  bizMap:    Map<string, string>;
  assetMap:  Map<string, string>;
  unitMap:   Map<string, string>;
  domainMap: Map<string, string>;
  sysMap:    Map<string, string>;
  kindMap:   Map<string, string>;
}

async function fetchCompositionLookups(): Promise<CompositionMaps> {
  const [biz, asset, unit, domain, sys, kind] = await Promise.all([
    Enmax_autocadbusinessesService.getAll({ select: ["enmax_autocadbusinessid", "enmax_acdncode"] }),
    Enmax_autocadassetsService.getAll({ select: ["enmax_autocadassetid", "enmax_acdncode"] }),
    Enmax_autocadunitsService.getAll({ select: ["enmax_autocadunitid", "enmax_acdncode"] }),
    Enmax_autocaddomainsService.getAll({ select: ["enmax_autocaddomainid", "enmax_acdncode"] }),
    Enmax_autocadsystemsService.getAll({ select: ["enmax_autocadsystemid", "enmax_acdncode"] }),
    Enmax_autocadkindsService.getAll({ select: ["enmax_autocadkindid", "enmax_acdncode"] }),
  ]);
  return {
    bizMap:    new Map(biz.data?.map(x => [x.enmax_autocadbusinessid, x.enmax_acdncode ?? ""]) ?? []),
    assetMap:  new Map(asset.data?.map(x => [x.enmax_autocadassetid,  x.enmax_acdncode ?? ""]) ?? []),
    unitMap:   new Map(unit.data?.map(x => [x.enmax_autocadunitid,    x.enmax_acdncode ?? ""]) ?? []),
    domainMap: new Map(domain.data?.map(x => [x.enmax_autocaddomainid,x.enmax_acdncode ?? ""]) ?? []),
    sysMap:    new Map(sys.data?.map(x => [x.enmax_autocadsystemid,   x.enmax_acdncode ?? ""]) ?? []),
    kindMap:   new Map(kind.data?.map(x => [x.enmax_autocadkindid,    x.enmax_acdncode ?? ""]) ?? []),
  };
}

export function useCompositionLookups() {
  return useQuery<CompositionMaps>({
    queryKey:  ["composition-lookups"],
    queryFn:   fetchCompositionLookups,
    staleTime: 60 * 60_000,
    placeholderData: {
      bizMap: new Map(), assetMap: new Map(), unitMap: new Map(),
      domainMap: new Map(), sysMap: new Map(), kindMap: new Map(),
    },
    throwOnError: false,
  });
}
