import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Enmax_autocadappconfigsService } from "../../generated";
import type { GridFetchParams } from "../../components/DataGrid";

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
  if (!r.success) throw new Error("Config fetch failed");
  let rows = (r.data ?? []).map(mapConfigRow);

  if (params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter(row => row.key.toLowerCase().includes(q) || row.value.toLowerCase().includes(q));
  }
  if (params.sort) {
    const { column, direction } = params.sort;
    rows = [...rows].sort((a, b) => {
      const cmp = String((a as unknown as Record<string, unknown>)[column] ?? "")
        .localeCompare(String((b as unknown as Record<string, unknown>)[column] ?? ""));
      return direction === "asc" ? cmp : -cmp;
    });
  }
  const totalCount = rows.length;
  const start = params.page * params.pageSize;
  return { rows: rows.slice(start, start + params.pageSize), totalCount };
}

export function useAppConfigRows() {
  return useQuery<ConfigRow[]>({
    queryKey: ["app-config-admin"],
    throwOnError: false,
    queryFn: async () => {
      const r = await Enmax_autocadappconfigsService.getAll({ select: CONFIG_SELECT, orderBy: ["enmax_acdnkey asc"] });
      if (!r.success) throw new Error("Config fetch failed");
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
  });
}
