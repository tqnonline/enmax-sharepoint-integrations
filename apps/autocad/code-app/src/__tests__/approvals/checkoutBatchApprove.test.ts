import { describe, it, expect } from "vitest";
import { CheckoutStatus } from "../../features/checkout/api/checkoutClient";
import type { CheckinRow } from "../../features/approvals/hooks/useCheckins";
import {
  batchKeyForRow,
  expandCheckoutSelectionToBatches,
  groupCheckoutRowsByBatch,
} from "../../features/approvals/checkoutBatchApprove";

function row(partial: Partial<CheckinRow> & Pick<CheckinRow, "checkoutId">): CheckinRow {
  return {
    batchId: "",
    drawingId: "d1",
    sheetId: "s1",
    drawingNumber: "DD-0001",
    documentDisplayNumber: "DD-0001",
    typeLabel: "Drawing",
    businessDisplay: "",
    assetDisplay: "",
    unitDisplay: "",
    domainDisplay: "",
    systemDisplay: "",
    kindDisplay: "",
    submittedById: "u1",
    submittedByName: "Alice",
    approvedById: "",
    approvedByName: "",
    submittedOn: "2026-05-19T10:00:00Z",
    status: CheckoutStatus.Requested,
    statusLabel: "Requested",
    currentRevision: "",
    submissionInfo: "",
    newPdfUrls: "",
    missingSheets: "",
    spLibraryUrl: "",
    sharePointUrl: "",
    ...partial,
  };
}

describe("checkoutBatchApprove", () => {
  it("uses batchId as the group key when present", () => {
    expect(batchKeyForRow(row({ checkoutId: "c1", batchId: "batch-a" }))).toBe("batch-a");
  });

  it("expands selection to all rows in the same batch", () => {
    const all = [
      row({ checkoutId: "c1", batchId: "batch-a", documentDisplayNumber: "DD-0001-001" }),
      row({ checkoutId: "c2", batchId: "batch-a", documentDisplayNumber: "DD-0001-002" }),
      row({ checkoutId: "c3", batchId: "batch-b", documentDisplayNumber: "DD-0002-001" }),
    ];
    const expanded = expandCheckoutSelectionToBatches([all[0]], all);
    expect(expanded.map((r) => r.checkoutId).sort()).toEqual(["c1", "c2"]);
  });

  it("groups rows by batch key", () => {
    const groups = groupCheckoutRowsByBatch([
      row({ checkoutId: "c1", batchId: "batch-a" }),
      row({ checkoutId: "c2", batchId: "batch-a" }),
      row({ checkoutId: "c3", batchId: "batch-b" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.batchKey === "batch-a")?.rows).toHaveLength(2);
  });
});
