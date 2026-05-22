import { useSuspenseQuery } from "@tanstack/react-query";
import { AppConfigSchema, type AppConfig } from "./AppConfigSchema";
import { Enmax_autocadappconfigsService } from "../generated/services/Enmax_autocadappconfigsService";
import type { Enmax_autocadappconfigs } from "../generated/models/Enmax_autocadappconfigsModel";

// Option set integer codes from enmax_acdn_appconfigvaluetype global option set
const VALUE_TYPE = { BOOLEAN: 1, INTEGER: 2, STRING: 3, JSON: 4 } as const;

function coerceValue(row: Enmax_autocadappconfigs): unknown {
  const typeCode = row.enmax_acdnvaluetype;
  const value = row.enmax_acdnvalue ?? "";
  switch (typeCode) {
    case VALUE_TYPE.BOOLEAN: return value === "true";
    case VALUE_TYPE.INTEGER: return parseInt(value, 10);
    case VALUE_TYPE.JSON:    return JSON.parse(value);
    default:                 return value;
  }
}

async function fetchAppConfig(): Promise<AppConfig> {
  const result = await Enmax_autocadappconfigsService.getAll({
    select: ["enmax_acdnkey", "enmax_acdnvalue", "enmax_acdnvaluetype"],
  });
  if (!result.success || !result.data) {
    console.error("[AppConfig] Fetch failed. result:", result);
    throw new Error(`App Config fetch failed: ${JSON.stringify(result.error ?? { success: result.success })}`);
  }
  const raw: Record<string, unknown> = {};
  for (const row of result.data) {
    if (row.enmax_acdnkey) raw[row.enmax_acdnkey] = coerceValue(row);
  }
  // Throws ZodError on validation failure — fail-loud per CLAUDE.md Rule 12.
  try {
    return AppConfigSchema.parse(raw);
  } catch (e) {
    console.error("[AppConfig] Zod validation failed. Raw config keys:", Object.keys(raw));
    console.error("[AppConfig] Zod error:", e);
    throw e;
  }
}

export function useAppConfig(): AppConfig {
  const { data } = useSuspenseQuery({
    queryKey: ["app-config"],
    queryFn: fetchAppConfig,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 3,
  });
  return data;
}
