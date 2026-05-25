import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../../.power/schemas/appschemas/dataSourcesInfo";
import type { RefTableConfig } from "./tableConfig";
import type { CompositionMaps } from "../approvals/hooks/useCompositionLookups";
import type { GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { logDataverseError } from "../../components/DataGrid/dataverseError";

/** statecode column filter → predicate (shared by the row + junction fetchers). */
function statecodePredicate(params: GridFetchParams): ((r: RefRow) => boolean) | undefined {
  const scFilter = params.filters["statecode"];
  const scStr = Array.isArray(scFilter) ? scFilter[0] : scFilter;
  if (scStr === null || scStr === undefined || scStr === "") return undefined;
  const sc = Number(scStr);
  return r => r.statecode === sc;
}

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
    onError: (e) => logDataverseError(`RefData/${config.entityName} save`, e),
  });
}

export function makeRefTableFetcher(config: RefTableConfig) {
  return async (params: GridFetchParams): Promise<{ rows: RefRow[]; totalCount: number }> => {
    const result = await client.retrieveMultipleRecordsAsync(config.entityName, {
      select:  [config.entityIdField, "enmax_acdncode", "enmax_acdndisplayname", "enmax_acdndescription", "enmax_acdnsortorder", "statecode"],
      orderBy: ["enmax_acdnsortorder asc", "enmax_acdncode asc"],
    });
    if (!result.success) {
      logDataverseError(`RefData/${config.entityName}`, result.error);
      throw new Error(`Failed to fetch ${config.entityName}`);
    }
    const rows: RefRow[] = (result.data ?? []).map(r => ({
      id:          (r as Record<string, string>)[config.entityIdField],
      code:        (r as Record<string, string>)["enmax_acdncode"] ?? "",
      displayName: (r as Record<string, string>)["enmax_acdndisplayname"] ?? "",
      description: (r as Record<string, string>)["enmax_acdndescription"] ?? "",
      sortOrder:   Number((r as Record<string, unknown>)["enmax_acdnsortorder"] ?? 0),
      statecode:   Number((r as Record<string, unknown>)["statecode"] ?? 0),
      ...(r as Record<string, unknown>),
    }));

    return clientPage(rows, params, {
      filter: statecodePredicate(params),
      searchText: r => [r.code, r.displayName, r.description],
    });
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
    if (!result.success) {
      logDataverseError(`RefData/${config.entityName}`, result.error);
      throw new Error(`Failed to fetch ${config.entityName}`);
    }

    const rows: RefRow[] = (result.data ?? []).map(rec => {
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

    return clientPage(rows, params, {
      filter: statecodePredicate(params),
      searchText: r => [r.code, r.displayName],
    });
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
  if (!activeResult.success || !inactiveResult.success) {
    // Don't coerce a failed/denied count to 0 — that reads as "empty table" and an
    // admin could act on a lie. Surface the failure instead.
    logDataverseError(`RefData/${config.entityName} summary`, activeResult.error ?? inactiveResult.error);
    throw new Error(`Failed to load ${config.entityName} summary`);
  }
  const active   = (activeResult.data   ?? []).length;
  const inactive = (inactiveResult.data ?? []).length;
  return { total: active + inactive, active, inactive };
}

export function useDeactivateRefRow(config: RefTableConfig) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, activate }: { id: string; activate: boolean }) => {
      await client.updateRecordAsync(config.entityName, id, { statecode: activate ? 0 : 1 } as Record<string, unknown>);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ref-table", config.entityName] }),
    onError: (e) => logDataverseError(`RefData/${config.entityName} status`, e),
  });
}
