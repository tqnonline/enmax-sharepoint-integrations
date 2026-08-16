import { describe, expect, it } from "vitest";

function sheetFilterForDrawings(
  drawingIds: string[],
  stateValue?: number,
): string {
  if (drawingIds.length === 0) {
    return "enmax_autocadsheetid eq '00000000-0000-0000-0000-000000000000'";
  }
  const drawingClause = drawingIds.map((id) => `_enmax_acdndrawing_value eq '${id}'`).join(" or ");
  const parts = [`(${drawingClause})`];
  if (stateValue != null) parts.push(`enmax_acdnstate eq ${stateValue}`);
  return parts.join(" and ");
}

describe("sheetFilterForDrawings", () => {
  it("scopes by drawing ids and sheet Available state (2), not owner or taxonomy", () => {
    const filter = sheetFilterForDrawings(["drw-a", "drw-b"], 2);
    expect(filter).toContain("_enmax_acdndrawing_value eq 'drw-a'");
    expect(filter).toContain("_enmax_acdndrawing_value eq 'drw-b'");
    expect(filter).toContain("enmax_acdnstate eq 2");
    expect(filter).not.toContain("_ownerid_value");
    expect(filter).not.toContain("enmax_acdnreservationtype");
  });

  it("returns impossible id filter when no drawings", () => {
    expect(sheetFilterForDrawings([], 2)).toContain("00000000-0000-0000-0000-000000000000");
  });

  it("omits sheet state when fetching for pending approval (checkout Requested filter)", () => {
    const filter = sheetFilterForDrawings(["drw-1"]);
    expect(filter).toContain("_enmax_acdndrawing_value eq 'drw-1'");
    expect(filter).not.toContain("enmax_acdnstate eq");
  });

  it("includes checked-out state (3)", () => {
    const filter = sheetFilterForDrawings(["drw-1"], 3);
    expect(filter).toContain("enmax_acdnstate eq 3");
  });
});
