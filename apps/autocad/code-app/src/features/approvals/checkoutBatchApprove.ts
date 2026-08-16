import { CheckoutStatus } from "../checkout/api/checkoutClient";
import type { CheckinRow } from "./hooks/useCheckins";
import type { CheckoutBatchGroup } from "./BulkCheckoutApproveDialog";

/** Group key for batch checkout approval — shared BatchId or per-row checkout id. */
export function batchKeyForRow(row: CheckinRow): string {
  return row.batchId || row.checkoutId;
}

/**
 * Expands a grid selection to full batches: selecting any row in a batch includes every
 * pending check-out request in that batch (same BatchId).
 */
export function expandCheckoutSelectionToBatches(
  selected: CheckinRow[],
  allRequested: CheckinRow[],
): CheckinRow[] {
  const keys = new Set(selected.map(batchKeyForRow));
  const seen = new Set<string>();
  const expanded: CheckinRow[] = [];
  for (const row of allRequested) {
    if (row.status !== CheckoutStatus.Requested) continue;
    if (!keys.has(batchKeyForRow(row))) continue;
    if (seen.has(row.checkoutId)) continue;
    seen.add(row.checkoutId);
    expanded.push(row);
  }
  return expanded;
}

export function groupCheckoutRowsByBatch(rows: CheckinRow[]): CheckoutBatchGroup[] {
  const byBatch = new Map<string, CheckinRow[]>();
  for (const row of rows) {
    const key = batchKeyForRow(row);
    byBatch.set(key, [...(byBatch.get(key) ?? []), row]);
  }
  return [...byBatch.entries()].map(([batchKey, batchRows]) => ({ batchKey, rows: batchRows }));
}
