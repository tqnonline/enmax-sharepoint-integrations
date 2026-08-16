import { useAppConfig } from "./useAppConfig";
import { GRID_DEFAULT_FROM_DAYS } from "../lib/dateRangeDefaults";

/** Inclusive lookback days for grid From date (App Config GridDefaultFromDays). */
export function useGridDefaultFromDays(): number {
  const days = useAppConfig().GridDefaultFromDays;
  return Number.isFinite(days) && days >= 1 ? Math.floor(days) : GRID_DEFAULT_FROM_DAYS;
}
