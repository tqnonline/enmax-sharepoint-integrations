import { useAppConfig } from "./useAppConfig";

export function usePageSize(): number {
  return useAppConfig().GridPageSize;
}
