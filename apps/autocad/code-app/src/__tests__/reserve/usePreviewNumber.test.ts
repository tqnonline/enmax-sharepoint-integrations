import { buildPreviewNumber } from "../../features/reserve/hooks/usePreviewNumber";

/**
 * Golden characterization: client preview must preserve the placeholder segment pattern
 * until approval assigns nnnn (ADR 0001 safety net before type-aware refactor).
 */
test("golden buildPreviewNumber with all segments uses hyphen separators and ???? suffix", () => {
  expect(
    buildPreviewNumber({
      businessCode: "GG",
      assetCode:    "CG",
      unitCode:     "00",
      domainCode:   "ECS",
      systemCode:   "AST",
      kindCode:     "DD",
    }),
  ).toBe("GG-CG-00-ECS-AST-DD-????");
});

/**
 * Golden characterization: empty/partial segments must fall back to BB/AA/UU/DDD/SSS/KK
 * placeholders so the wizard always shows a complete preview skeleton.
 */
test("golden buildPreviewNumber with empty segments uses fallback placeholders", () => {
  expect(buildPreviewNumber({})).toBe("BB-AA-UU-DDD-SSS-KK-????");
});
