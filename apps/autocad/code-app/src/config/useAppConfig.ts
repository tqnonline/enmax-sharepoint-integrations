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
    // Detail (Dataverse OData error fields) stays in the console — the thrown
    // message must not leak it, since AppErrorBoundary renders error.message
    // (gated to DEV only there, but defence in depth).
    console.error("[AppConfig] Fetch failed. result:", result);
    throw new Error("App Config fetch failed. Contact your admin.");
  }
  const raw: Record<string, unknown> = {};
  for (const row of result.data) {
    if (row.enmax_acdnkey) raw[row.enmax_acdnkey] = coerceValue(row);
  }
  // Fail-loud per CLAUDE.md Rule 12, but do NOT propagate the ZodError as the
  // thrown message — ZodError.message includes config key paths and the
  // invalid values, which AppErrorBoundary would render. Keep detail in the
  // console; surface a generic message to the UI.
  try {
    return AppConfigSchema.parse(raw);
  } catch (e) {
    console.error("[AppConfig] Zod validation failed. Raw config keys:", Object.keys(raw));
    console.error("[AppConfig] Zod error:", e);
    throw new Error("App Config validation failed. Contact your admin.");
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
