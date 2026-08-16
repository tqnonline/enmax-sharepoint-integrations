import { useQuery } from "@tanstack/react-query";
import { SystemusersService } from "../../generated";

export interface PeopleOption {
  id: string;
  name: string;
}

export async function searchPeople(query: string): Promise<PeopleOption[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const q = trimmed.replace(/'/g, "''");
  const result = await SystemusersService.getAll({
    filter: `contains(fullname,'${q}') or contains(internalemailaddress,'${q}')`,
    select: ["systemuserid", "fullname"],
    top: 20,
  });
  return (result.data ?? [])
    .filter(u => !!u.systemuserid)
    .map(u => ({ id: u.systemuserid!, name: u.fullname ?? u.systemuserid! }));
}

export async function resolvePeopleNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const filter = unique.map(id => `systemuserid eq '${id}'`).join(" or ");
  const result = await SystemusersService.getAll({
    filter: `(${filter})`,
    select: ["systemuserid", "fullname"],
  });
  for (const u of result.data ?? []) {
    if (u.systemuserid) map.set(u.systemuserid, u.fullname ?? u.systemuserid);
  }
  return map;
}

export function usePeopleSearch(query: string) {
  return useQuery({
    queryKey: ["people-search", query],
    queryFn: () => searchPeople(query),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}
