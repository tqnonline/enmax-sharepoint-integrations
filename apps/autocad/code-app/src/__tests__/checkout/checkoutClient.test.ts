import { describe, expect, it } from "vitest";
import {
  CheckoutStatus,
  openCheckoutFilterForDrawing,
  openCheckoutFilterForDrawings,
  openCheckoutStatusFilter,
} from "../../features/checkout/api/checkoutClient";

describe("openCheckoutStatusFilter", () => {
  it("includes Requested (6) so gated pending requests are visible", () => {
    const filter = openCheckoutStatusFilter();
    expect(filter).toContain(`eq ${CheckoutStatus.Requested}`);
    expect(filter).toContain(`eq ${CheckoutStatus.Open}`);
    expect(filter).toContain(`eq ${CheckoutStatus.AwaitingValidation}`);
    expect(filter).not.toContain("lt 3");
  });

  it("builds multi-drawing filter", () => {
    const filter = openCheckoutFilterForDrawings(["aaa-bbb", "ccc-ddd"]);
    expect(filter).toContain("_enmax_acdndrawing_value eq 'aaa-bbb'");
    expect(filter).toContain("_enmax_acdndrawing_value eq 'ccc-ddd'");
    expect(filter).toContain(`eq ${CheckoutStatus.Requested}`);
  });

  it("builds single-drawing filter", () => {
    expect(openCheckoutFilterForDrawing("id-1")).toContain("_enmax_acdndrawing_value eq 'id-1'");
  });
});
