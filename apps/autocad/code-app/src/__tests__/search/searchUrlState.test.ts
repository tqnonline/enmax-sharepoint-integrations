import { describe, it, expect } from "vitest";
import {
  buildDocumentDetailUrl,
  buildSearchPageUrl,
  filtersFromSearchParams,
  hasSearchPrefill,
  parseHeaderSearchTab,
  parseSearchTab,
} from "../../features/search/searchUrlState";

describe("searchUrlState", () => {
  it("builds search page url with query, tab, and composition ids", () => {
    const url = buildSearchPageUrl({
      q: "GG-CG-00",
      tab: "drawings",
      composition: {
        businessId: "biz-1",
        assetId: "ast-1",
        unitId: "",
        domainId: "",
        systemId: "",
        kindId: "",
      },
    });
    expect(url).toContain("/search?");
    expect(url).toContain("q=GG-CG-00");
    expect(url).toContain("tab=drawings");
    expect(url).toContain("businessId=biz-1");
    expect(url).toContain("assetId=ast-1");
  });

  it("parses prefill filters from search params", () => {
    const params = new URLSearchParams("q=GG-CG&tab=documents&businessId=biz-1");
    expect(hasSearchPrefill(params)).toBe(true);
    const filters = filtersFromSearchParams(params);
    expect(filters.number).toBe("GG-CG");
    expect(filters.composition.businessId).toBe("biz-1");
    expect(filters.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(filters.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ignores legacy reservations tab; header search never uses RES tab", () => {
    expect(parseSearchTab("reservations")).toBe("drawings");
    expect(parseHeaderSearchTab("reservations")).toBe("all");
  });

  it("builds document detail url with returnTo for back navigation", () => {
    const url = buildDocumentDetailUrl({
      documentId: "sheet-1",
      drawingId: "drw-1",
      tab: "drawings",
      returnTo: "/search?q=GG&tab=drawings",
    });
    expect(url).toContain("/search/documents/sheet-1?");
    expect(url).toContain("drawingId=drw-1");
    expect(url).toContain("returnTo=");
  });
});
