import { describe, expect, it } from "vitest";
import { CheckoutStatus } from "../../features/checkout/api/checkoutClient";
import type { SheetCheckoutInfo } from "../../features/approvals/hooks/useSheetCheckouts";
import {
  matchesDocumentStatusFilter,
  searchDocumentHolderDetail,
  searchDocumentStatusLabel,
} from "../../features/search/searchDocumentStatus";

const checkout = (status: number, name: string): SheetCheckoutInfo => ({
  checkoutId: "co-1",
  status,
  statusLabel: "x",
  checkedOutByName: name,
});

describe("searchDocumentStatus", () => {
  it("labels open checkout workflows from checkout status", () => {
    expect(searchDocumentStatusLabel(2, checkout(CheckoutStatus.Requested, "A"))).toBe("Pending Approval");
    expect(searchDocumentStatusLabel(2, checkout(CheckoutStatus.Open, "A"))).toBe("Checked Out");
    expect(searchDocumentStatusLabel(2, checkout(CheckoutStatus.AwaitingValidation, "A"))).toBe("Awaiting Validation");
  });

  it("describes who holds or requested the document", () => {
    expect(searchDocumentHolderDetail("Pending Approval", checkout(CheckoutStatus.Requested, "Heather")))
      .toBe("Check-out requested by Heather");
    expect(searchDocumentHolderDetail("Checked Out", checkout(CheckoutStatus.Open, "Heather")))
      .toBe("Checked out to Heather");
    expect(searchDocumentHolderDetail("Awaiting Validation", checkout(CheckoutStatus.AwaitingValidation, "Bob")))
      .toBe("Check-in requested by Bob");
    expect(searchDocumentHolderDetail("Available", undefined)).toBe("");
  });

  it("filters status buckets including Allocated as available", () => {
    expect(matchesDocumentStatusFilter("Allocated", "available")).toBe(true);
    expect(matchesDocumentStatusFilter("Available", "available")).toBe(true);
    expect(matchesDocumentStatusFilter("Checked Out", "checkedout")).toBe(true);
    expect(matchesDocumentStatusFilter("Pending Approval", "pendingapproval")).toBe(true);
    expect(matchesDocumentStatusFilter("Awaiting Validation", "awaitingvalidation")).toBe(true);
    expect(matchesDocumentStatusFilter("Checked Out", "available")).toBe(false);
  });
});
