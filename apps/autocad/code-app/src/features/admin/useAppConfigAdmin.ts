import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Enmax_autocadappconfigsService } from "../../generated";
import type { GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { logDataverseError } from "../../components/DataGrid/dataverseError";

export interface ConfigRow {
  id: string;
  key: string;
  value: string;
  valueType: number;
}

// Mirrors the enmax_acdn_appconfigvaluetype global option set (see useAppConfig.ts).
export const VALUE_TYPE = { BOOLEAN: 1, INTEGER: 2, STRING: 3, JSON: 4 } as const;
export const VALUE_TYPE_LABELS: Record<number, string> = {
  1: "Boolean", 2: "Integer", 3: "String", 4: "JSON",
};

function mapConfigRow(x: unknown): ConfigRow {
  const o = x as Record<string, unknown>;
  return {
    id:        o["enmax_autocadappconfigid"] as string,
    key:       (o["enmax_acdnkey"] as string) ?? "",
    value:     (o["enmax_acdnvalue"] as string) ?? "",
    valueType: (o["enmax_acdnvaluetype"] as number) ?? VALUE_TYPE.STRING,
  };
}

const CONFIG_SELECT = ["enmax_autocadappconfigid", "enmax_acdnkey", "enmax_acdnvalue", "enmax_acdnvaluetype"];

export async function fetchAppConfigRows(params: GridFetchParams): Promise<{ rows: ConfigRow[]; totalCount: number }> {
  const r = await Enmax_autocadappconfigsService.getAll({ select: CONFIG_SELECT, orderBy: ["enmax_acdnkey asc"] });
  if (!r.success) {
    logDataverseError("AppConfig", r.error);
    throw new Error("Config fetch failed");
  }
  const rows = (r.data ?? []).map(mapConfigRow);
  return clientPage(rows, params, { searchText: row => [row.key, row.value] });
}

export function useAppConfigRows() {
  return useQuery<ConfigRow[]>({
    queryKey: ["app-config-admin"],
    throwOnError: false,
    queryFn: async () => {
      const r = await Enmax_autocadappconfigsService.getAll({ select: CONFIG_SELECT, orderBy: ["enmax_acdnkey asc"] });
      if (!r.success) {
        logDataverseError("AppConfig", r.error);
        throw new Error("Config fetch failed");
      }
      return (r.data ?? []).map(mapConfigRow);
    },
  });
}

export interface ConfigRowMutation {
  id?: string;
  key: string;
  value: string;
  valueType: number;
}

export function useUpsertConfigRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: ConfigRowMutation) => {
      const fields = {
        enmax_acdnkey:       row.key,
        enmax_acdnvalue:     row.value,
        enmax_acdnvaluetype: row.valueType,
      };
      if (row.id) {
        await Enmax_autocadappconfigsService.update(row.id, fields as Parameters<typeof Enmax_autocadappconfigsService.update>[1]);
      } else {
        await Enmax_autocadappconfigsService.create(fields as Parameters<typeof Enmax_autocadappconfigsService.create>[0]);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["app-config-admin"] });
      void qc.invalidateQueries({ queryKey: ["app-config-admin-grid"] });
      void qc.invalidateQueries({ queryKey: ["app-config"] });
    },
    onError: (e) => logDataverseError("AppConfig upsert", e),
  });
}
