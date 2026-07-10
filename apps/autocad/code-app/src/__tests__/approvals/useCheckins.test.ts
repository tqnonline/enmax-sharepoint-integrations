import { describe, it, expect } from "vitest";
import {
  CHECKOUT_APPROVAL_SELECT,
  SHEET_APPROVAL_SELECT,
} from "../../features/approvals/hooks/useCheckins";

describe("useCheckins OData selects", () => {
  it("sheet select excludes checkout-only columns", () => {
    expect(SHEET_APPROVAL_SELECT).not.toContain("enmax_acdnbatchid");
    expect(SHEET_APPROVAL_SELECT).not.toContain("_enmax_acdnbusiness_value");
    expect(SHEET_APPROVAL_SELECT).toContain("enmax_acdnspdestinationurl");
  });

  it("checkout select aligns with My Items and avoids undeployed batch id", () => {
    expect(CHECKOUT_APPROVAL_SELECT).toContain("_enmax_acdnsheet_value");
    expect(CHECKOUT_APPROVAL_SELECT).toContain("enmax_acdnsubmissioninfo");
    expect(CHECKOUT_APPROVAL_SELECT).not.toContain("enmax_acdnbatchid");
  });
});
