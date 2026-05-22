import { useQuery } from "@tanstack/react-query";
import { Enmax_autocadreservationsService } from "../generated/services/Enmax_autocadreservationsService";

export interface MatchingGuids {
  businessIds: string[];
  assetIds:    string[];
  unitIds:     string[];
  domainIds:   string[];
  systemIds:   string[];
  kindIds:     string[];
  positional?: boolean;  // true = AND between non-empty field groups (composition search)
}

export interface HeaderSearchResult {
  id: string;
  number: string;
  status: number;
  reason?: string;
  creatorName?: string;
  createdon: string;
  businessId?: string;
  assetId?: string;
  unitId?: string;
  domainId?: string;
  systemId?: string;
  kindId?: string;
}

async function fetchSearchResults(
  q: string,
  status?: number,
  guids?: MatchingGuids,
): Promise<HeaderSearchResult[]> {
  const safe = q.replace(/'/g, "''");

  let textFilter: string;

  if (guids?.positional) {
    // Composition search: AND between matched field groups so "DG-VS-00" finds
    // reservations with business=DG AND asset=VS AND unit=00
    const andClauses: string[] = [];
    const push = (ids: string[], field: string) => {
      if (ids.length) andClauses.push(`(${ids.map((id) => `${field} eq ${id}`).join(" or ")})`);
    };
    push(guids.businessIds, "_enmax_acdnbusiness_value");
    push(guids.assetIds,    "_enmax_acdnasset_value");
    push(guids.unitIds,     "_enmax_acdnunit_value");
    push(guids.domainIds,   "_enmax_acdndomain_value");
    push(guids.systemIds,   "_enmax_acdnsystem_value");
    push(guids.kindIds,     "_enmax_acdnkind_value");
    textFilter = andClauses.length
      ? andClauses.join(" and ")
      : "enmax_acdnreservationid eq null"; // no matches → return nothing
  } else {
    const clauses: string[] = [
      `contains(enmax_acdnreservationid, '${safe}')`,
      `contains(enmax_acdnreason, '${safe}')`,
    ];
    if (guids) {
      for (const id of guids.businessIds) clauses.push(`_enmax_acdnbusiness_value eq ${id}`);
      for (const id of guids.assetIds)    clauses.push(`_enmax_acdnasset_value eq ${id}`);
      for (const id of guids.unitIds)     clauses.push(`_enmax_acdnunit_value eq ${id}`);
      for (const id of guids.domainIds)   clauses.push(`_enmax_acdndomain_value eq ${id}`);
      for (const id of guids.systemIds)   clauses.push(`_enmax_acdnsystem_value eq ${id}`);
      for (const id of guids.kindIds)     clauses.push(`_enmax_acdnkind_value eq ${id}`);
    }
    textFilter = clauses.join(" or ");
  }

  const filter = status !== undefined
    ? `(${textFilter}) and enmax_acdnstatus eq ${status}`
    : textFilter;

  const result = await Enmax_autocadreservationsService.getAll({
    filter,
    select: [
      "enmax_autocadreservationid",
      "enmax_acdnreservationid",
      "enmax_acdnstatus",
      "enmax_acdnreason",
      "createdon",
      "_createdby_value",
      "_enmax_acdnbusiness_value",
      "_enmax_acdnasset_value",
      "_enmax_acdnunit_value",
      "_enmax_acdndomain_value",
      "_enmax_acdnsystem_value",
      "_enmax_acdnkind_value",
    ],
    orderBy: ["createdon desc"],
    top: 8,
  });

  if (!result.success || !result.data) return [];

  return result.data.map((r) => {
    const raw = r as unknown as Record<string, unknown>;
    const creatorName =
      (raw["_createdby_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ??
      (raw["_createdby_value_Formatted"] as string | undefined);
    return {
      id:         r.enmax_autocadreservationid ?? "",
      number:     r.enmax_acdnreservationid ?? r.enmax_autocadreservationid ?? "",
      status:     (r.enmax_acdnstatus as number) ?? 1,
      reason:     r.enmax_acdnreason ?? undefined,
      creatorName,
      createdon:  r.createdon ?? "",
      businessId: r._enmax_acdnbusiness_value ?? undefined,
      assetId:    r._enmax_acdnasset_value    ?? undefined,
      unitId:     r._enmax_acdnunit_value      ?? undefined,
      domainId:   r._enmax_acdndomain_value    ?? undefined,
      systemId:   r._enmax_acdnsystem_value    ?? undefined,
      kindId:     r._enmax_acdnkind_value      ?? undefined,
    };
  });
}

export function useHeaderSearch(query: string, status?: number, guids?: MatchingGuids) {
  return useQuery({
    queryKey:  ["header-search", query, status, guids ? JSON.stringify(guids) : null],
    queryFn:   () => fetchSearchResults(query, status, guids),
    enabled:   query.trim().length >= 2,
    staleTime: 30_000,
    placeholderData: [],
  });
}
