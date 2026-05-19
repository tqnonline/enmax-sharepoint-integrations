import { buildPreviewNumber, SEQUENCE_TOOLTIP } from "../../features/reserve/hooks/usePreviewNumber";

// Test 3 (preview logic part) — ???? placeholder must appear in output
test("preview always ends with ???? as the sequence placeholder", () => {
  const preview = buildPreviewNumber({
    businessCode: "GG",
    assetCode:    "CG",
    unitCode:     "00",
    domainCode:   "ECS",
    systemCode:   "AST",
    kindCode:     "DD",
  });
  expect(preview).toBe("GG-CG-00-ECS-AST-DD-????");
  expect(preview).toContain("????");
});

test("sequence tooltip text matches expected message", () => {
  expect(SEQUENCE_TOOLTIP).toBe("Sequence number assigned at admin approval.");
});

test("partial segments produce ?? placeholders but still end with ????", () => {
  const preview = buildPreviewNumber({ businessCode: "GG" });
  expect(preview.endsWith("-????")).toBe(true);
  expect(preview).not.toMatch(/\d{4}/);
});
