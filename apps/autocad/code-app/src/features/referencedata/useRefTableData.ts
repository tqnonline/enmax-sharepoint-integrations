import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../../.power/schemas/appschemas/dataSourcesInfo";
import type { RefTableConfig } from "./tableConfig";
import type { CompositionMaps } from "../approvals/hooks/useCompositionLookups";
import type { GridFetchParams } from "../../components/DataGrid";

export interface RefRow {
  id: string;
  code: string;
  displayName: string;
  description: string;
  sortOrder: number;
  statecode: number;
  [key: string]: unknown;
}

const client = getClient(dataSourcesInfo);

export interface RefRowMutation {
  id?: string;
  code: string;
  displayName: string;
  description?: string;
  sortOrder?: number;
}

export function useSaveRefRow(config: RefTableConfig) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: RefRowMutation) => {
      const fields = {
        enmax_acdncode:        row.code,
        enmax_acdndisplayname: row.displayName,
        enmax_acdndescription: row.description ?? "",
        enmax_acdnsortorder:   row.sortOrder ?? 0,
      };
      if (row.id) {
        await client.updateRecordAsync(config.entityName, row.id, fields);
      } else {
        await client.createRecordAsync(config.entityName, fields);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ref-table", config.entityName] }),
  });
}

export function makeRefTableFetcher(config: RefTableConfig) {
  return async (params: GridFetchParams): Promise<{ rows: RefRow[]; totalCount: number }> => {
    const result = await client.retrieveMultipleRecordsAsync(config.entityName, {
      select:  [config.entityIdField, "enmax_acdncode", "enmax_acdndisplayname", "enmax_acdndescription", "enmax_acdnsortorder", "statecode"],
      orderBy: ["enmax_acdnsortorder asc", "enmax_acdncode asc"],
    });
    if (!result.success) throw new Error(`Failed to fetch ${config.entityName}`);
    let rows: RefRow[] = (result.data ?? []).map(r => ({
      id:          (r as Record<string, string>)[config.entityIdField],
      code:        (r as Record<string, string>)["enmax_acdncode"] ?? "",
      displayName: (r as Record<string, string>)["enmax_acdndisplayname"] ?? "",
      description: (r as Record<string, string>)["enmax_acdndescription"] ?? "",
      sortOrder:   Number((r as Record<string, unknown>)["enmax_acdnsortorder"] ?? 0),
      statecode:   Number((r as Record<string, unknown>)["statecode"] ?? 0),
      ...(r as Record<string, unknown>),
    }));

    if (params.search) {
      const q = params.search.toLowerCase();
      rows = rows.filter(r =>
        r.code.toLowerCase().includes(q) ||
        r.displayName.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
      );
    }

    const scFilter = params.filters["statecode"];
    const scStr = Array.isArray(scFilter) ? scFilter[0] : scFilter;
    if (scStr !== null && scStr !== undefined && scStr !== "") {
      const sc = Number(scStr);
      rows = rows.filter(r => r.statecode === sc);
    }

    if (params.sort) {
      const { column, direction } = params.sort;
      rows = [...rows].sort((a, b) => {
        const av = (a as Record<string, unknown>)[column];
        const bv = (b as Record<string, unknown>)[column];
        const cmp = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""));
        return direction === "asc" ? cmp : -cmp;
      });
    }

    const totalCount = rows.length;
    const start = params.page * params.pageSize;
    return { rows: rows.slice(start, start + params.pageSize), totalCount };
  };
}

// Junction _value field → which composition code map resolves its GUID to a short code.
const JUNCTION_FIELD_MAP: Record<string, keyof CompositionMaps> = {
  _enmax_acdnbusiness_value: "bizMap",
  _enmax_acdnasset_value:    "assetMap",
  _enmax_acdnunit_value:     "unitMap",
  _enmax_acdndomain_value:   "domainMap",
  _enmax_acdnsystem_value:   "sysMap",
  _enmax_acdnkind_value:     "kindMap",
};

// Junction tables (e.g. Approved BB–AA Combinations) have no code/displayName/sortorder
// columns — selecting those 400s. Instead select the lookup GUIDs + statecode and resolve
// each GUID to its short code via the composition maps, rendering e.g. "GG–CG".
export function makeJunctionFetcher(config: RefTableConfig, maps?: CompositionMaps) {
  return async (params: GridFetchParams): Promise<{ rows: RefRow[]; totalCount: number }> => {
    const fields = config.junctionFields ?? [];
    const result = await client.retrieveMultipleRecordsAsync(config.entityName, {
      select: [config.entityIdField, ...fields, "statecode"],
    });
    if (!result.success) throw new Error(`Failed to fetch ${config.entityName}`);

    let rows: RefRow[] = (result.data ?? []).map(rec => {
      const o = rec as Record<string, unknown>;
      const code = fields
        .map(f => {
          const guid   = o[f] as string | undefined;
          const mapKey = JUNCTION_FIELD_MAP[f];
          return (guid && mapKey && maps?.[mapKey].get(guid)) || "?";
        })
        .join("–");
      const displayName = fields
        .map(f => (o[`${f}@OData.Community.Display.V1.FormattedValue`] as string) ?? "")
        .filter(Boolean)
        .join(" – ");
      return {
        id:          o[config.entityIdField] as string,
        code,
        displayName,
        description: "",
        sortOrder:   0,
        statecode:   Number(o["statecode"] ?? 0),
      };
    });

    if (params.search) {
      const q = params.search.toLowerCase();
      rows = rows.filter(r => r.code.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q));
    }

    const scFilter = params.filters["statecode"];
    const scStr = Array.isArray(scFilter) ? scFilter[0] : scFilter;
    if (scStr !== null && scStr !== undefined && scStr !== "") {
      const sc = Number(scStr);
      rows = rows.filter(r => r.statecode === sc);
    }

    if (params.sort) {
      const { column, direction } = params.sort;
      rows = [...rows].sort((a, b) => {
        const cmp = String((a as Record<string, unknown>)[column] ?? "")
          .localeCompare(String((b as Record<string, unknown>)[column] ?? ""));
        return direction === "asc" ? cmp : -cmp;
      });
    }

    const totalCount = rows.length;
    const start = params.page * params.pageSize;
    return { rows: rows.slice(start, start + params.pageSize), totalCount };
  };
}

export async function fetchMaxSortOrder(config: RefTableConfig): Promise<number> {
  const result = await client.retrieveMultipleRecordsAsync(config.entityName, {
    select:  ["enmax_acdnsortorder"],
    orderBy: ["enmax_acdnsortorder desc"],
    top:     1,
  });
  if (!result.success || !result.data || result.data.length === 0) return 0;
  return Number((result.data[0] as Record<string, unknown>)["enmax_acdnsortorder"] ?? 0);
}

export async function fetchRefTableSummary(config: RefTableConfig): Promise<{ total: number; active: number; inactive: number }> {
  const [activeResult, inactiveResult] = await Promise.all([
    client.retrieveMultipleRecordsAsync(config.entityName, {
      select:  [config.entityIdField],
      filter:  "statecode eq 0",
    }),
    client.retrieveMultipleRecordsAsync(config.entityName, {
      select:  [config.entityIdField],
      filter:  "statecode eq 1",
    }),
  ]);
  const active   = activeResult.success   ? (activeResult.data   ?? []).length : 0;
  const inactive = inactiveResult.success ? (inactiveResult.data ?? []).length : 0;
  return { total: active + inactive, active, inactive };
}

export function useDeactivateRefRow(config: RefTableConfig) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, activate }: { id: string; activate: boolean }) => {
      await client.updateRecordAsync(config.entityName, id, { statecode: activate ? 0 : 1 } as Record<string, unknown>);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ref-table", config.entityName] }),
  });
}
