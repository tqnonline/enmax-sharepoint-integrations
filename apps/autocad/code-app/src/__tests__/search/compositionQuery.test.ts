import { describe, it, expect } from "vitest";
import {
  guidsToCompositionFilter,
  looksLikeDocumentNumber,
  matchingGuidsFromQuery,
} from "../../features/search/compositionQuery";
import type { CompositionMaps } from "../../features/approvals/hooks/useCompositionLookups";

const lookups: CompositionMaps = {
  bizMap: new Map([["biz-gg", "GG"], ["biz-dg", "DG"]]),
  assetMap: new Map([["ast-cp", "CP"], ["ast-cg", "CG"]]),
  unitMap: new Map([["unit-09", "09"], ["unit-00", "00"]]),
  domainMap: new Map([["dom-ecs", "ECS"]]),
  sysMap: new Map([["sys-ast", "AST"]]),
  kindMap: new Map([["kind-ls", "LS"], ["kind-dd", "DD"]]),
};

describe("compositionQuery", () => {
  it("detects document numbers vs composition codes", () => {
    expect(looksLikeDocumentNumber("GG-CG-00-ECS-AST-DD-0001-001")).toBe(true);
    expect(looksLikeDocumentNumber("GG-CP-09")).toBe(false);
  });

  it("positional hyphen query maps to composition ids", () => {
    const guids = matchingGuidsFromQuery("GG-CP-09", lookups)!;
    expect(guids.positional).toBe(true);
    expect(guidsToCompositionFilter(guids)).toEqual({
      businessId: "biz-gg",
      assetId: "ast-cp",
      unitId: "unit-09",
      domainId: "",
      systemId: "",
      kindId: "",
    });
  });

  it("single token matches any composition code containing the token", () => {
    const guids = matchingGuidsFromQuery("gg", lookups)!;
    expect(guids.businessIds).toContain("biz-gg");
    expect(guids.positional).toBeUndefined();
  });
});
