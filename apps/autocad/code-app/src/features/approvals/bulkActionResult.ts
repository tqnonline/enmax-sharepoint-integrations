/** Outcome of a sequential bulk API action shown in the confirm dialog. */
export type BulkActionResult = {
  status: "success" | "partial" | "error";
  successCount: number;
  failedCount: number;
  errorMessage?: string;
} | null;

export function bulkResultMessage(result: NonNullable<BulkActionResult>, itemLabel: string): string {
  if (result.status === "success") {
    return `All ${result.successCount} ${itemLabel}${result.successCount === 1 ? "" : "s"} approved successfully.`;
  }
  if (result.status === "partial") {
    return `${result.successCount} approved, ${result.failedCount} failed.`;
  }
  return `Approval failed${result.failedCount > 1 ? ` for all ${result.failedCount} items` : ""}.`;
}
