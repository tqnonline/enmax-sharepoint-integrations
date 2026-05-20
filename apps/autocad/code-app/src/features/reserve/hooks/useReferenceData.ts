import { useQuery } from "@tanstack/react-query";
import {
  Enmax_autocadbusinessesService,
  Enmax_autocadassetsService,
  Enmax_autocadunitsService,
  Enmax_autocaddomainsService,
  Enmax_autocadsystemsService,
  Enmax_autocadkindsService,
} from "../../../generated";

export interface RefItem {
  id: string;
  code: string;
  name: string;
}

export interface ReferenceData {
  businesses: RefItem[];
  assets:     RefItem[];
  units:      RefItem[];
  domains:    RefItem[];
  systems:    RefItem[];
  kinds:      RefItem[];
}

const ACTIVE_ONLY = { filter: 'statecode eq 0', orderBy: ['enmax_acdncode'] };

export function useReferenceData() {
  return useQuery<ReferenceData>({
    queryKey: ["reference-data"],
    queryFn: async () => {
      const [biz, asset, unit, domain, sys, kind] = await Promise.all([
        Enmax_autocadbusinessesService.getAll({ ...ACTIVE_ONLY, select: ['enmax_autocadbusinessid', 'enmax_acdncode', 'enmax_acdndisplayname'] }),
        Enmax_autocadassetsService.getAll({ ...ACTIVE_ONLY, select: ['enmax_autocadassetid', 'enmax_acdncode', 'enmax_acdndisplayname'] }),
        Enmax_autocadunitsService.getAll({ ...ACTIVE_ONLY, select: ['enmax_autocadunitid', 'enmax_acdncode', 'enmax_acdndisplayname'] }),
        Enmax_autocaddomainsService.getAll({ ...ACTIVE_ONLY, select: ['enmax_autocaddomainid', 'enmax_acdncode', 'enmax_acdndisplayname'] }),
        Enmax_autocadsystemsService.getAll({ ...ACTIVE_ONLY, select: ['enmax_autocadsystemid', 'enmax_acdncode', 'enmax_acdndisplayname'] }),
        Enmax_autocadkindsService.getAll({ ...ACTIVE_ONLY, select: ['enmax_autocadkindid', 'enmax_acdncode', 'enmax_acdndisplayname'] }),
      ]);

      if (!biz.success)    throw new Error('businesses fetch failed');
      if (!asset.success)  throw new Error('assets fetch failed');
      if (!unit.success)   throw new Error('units fetch failed');
      if (!domain.success) throw new Error('domains fetch failed');
      if (!sys.success)    throw new Error('systems fetch failed');
      if (!kind.success)   throw new Error('kinds fetch failed');

      return {
        businesses: biz.data!.map(r   => ({ id: r.enmax_autocadbusinessid, code: r.enmax_acdncode, name: r.enmax_acdndisplayname ?? r.enmax_acdncode })),
        assets:     asset.data!.map(r  => ({ id: r.enmax_autocadassetid,   code: r.enmax_acdncode, name: r.enmax_acdndisplayname ?? r.enmax_acdncode })),
        units:      unit.data!.map(r   => ({ id: r.enmax_autocadunitid,    code: r.enmax_acdncode, name: r.enmax_acdndisplayname ?? r.enmax_acdncode })),
        domains:    domain.data!.map(r => ({ id: r.enmax_autocaddomainid,  code: r.enmax_acdncode, name: r.enmax_acdndisplayname ?? r.enmax_acdncode })),
        systems:    sys.data!.map(r    => ({ id: r.enmax_autocadsystemid,  code: r.enmax_acdncode, name: r.enmax_acdndisplayname ?? r.enmax_acdncode })),
        kinds:      kind.data!.map(r   => ({ id: r.enmax_autocadkindid,    code: r.enmax_acdncode, name: r.enmax_acdndisplayname ?? r.enmax_acdncode })),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
