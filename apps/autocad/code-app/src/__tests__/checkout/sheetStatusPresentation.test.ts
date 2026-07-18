import { describe, expect, test } from "vitest";
import { CheckoutStatus } from "../../features/checkout/api/checkoutClient";
import {
  sheetHasPriorCheckout,
  sheetStatusPresentation,
} from "../../features/checkout/components/sheetStatusPresentation";
import { SHEET_STATE_AVAILABLE } from "../../features/approvals/hooks/useDrawingSheets";

describe("sheetStatusPresentation", () => {
  test("Available with no checkout history is Allocated (never checked out)", () => {
    expect(sheetStatusPresentation(SHEET_STATE_AVAILABLE, undefined)).toEqual({
      label: "Allocated",
      color: "success",
    });
    expect(sheetHasPriorCheckout(undefined)).toBe(false);
  });

  test("Available after a closed checkout cycle is Available", () => {
    const closed = {
      checkoutId: "c1",
      status: CheckoutStatus.ClosedApproved,
      statusLabel: "Approved",
      closedOn: "2026-07-01T00:00:00Z",
    };
    expect(sheetHasPriorCheckout(closed)).toBe(true);
    expect(sheetStatusPresentation(SHEET_STATE_AVAILABLE, closed)).toEqual({
      label: "Available",
      color: "success",
    });
  });

  test("open / pending checkout statuses keep their labels", () => {
    expect(
      sheetStatusPresentation(SHEET_STATE_AVAILABLE, {
        checkoutId: "c1",
        status: CheckoutStatus.Open,
        statusLabel: "Open",
      }),
    ).toEqual({ label: "Checked Out", color: "warning" });
    expect(
      sheetStatusPresentation(SHEET_STATE_AVAILABLE, {
        checkoutId: "c1",
        status: CheckoutStatus.Requested,
        statusLabel: "Requested",
      }),
    ).toEqual({ label: "Pending Approval", color: "warning" });
  });
});
