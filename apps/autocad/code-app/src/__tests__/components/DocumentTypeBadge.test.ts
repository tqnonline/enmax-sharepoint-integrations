import { describe, expect, it } from "vitest";
import { documentTypeBadgeColor } from "../../components/documentTypeBadgeColor";

describe("documentTypeBadgeColor", () => {
  it("maps each taxonomy type to a distinct Fluent badge color", () => {
    expect(documentTypeBadgeColor("Drawing")).toBe("brand");
    expect(documentTypeBadgeColor("Drawing Document")).toBe("informative");
    expect(documentTypeBadgeColor("Standard")).toBe("success");
    expect(documentTypeBadgeColor("Procedure")).toBe("warning");
    expect(documentTypeBadgeColor("Form")).toBe("important");
  });

  it("is case-insensitive and tolerates related nouns", () => {
    expect(documentTypeBadgeColor("drawing sheet")).toBe("brand");
    expect(documentTypeBadgeColor("FORMS")).toBe("important");
    expect(documentTypeBadgeColor("Procedures")).toBe("warning");
  });

  it("falls back to subtle for unknown labels", () => {
    expect(documentTypeBadgeColor(undefined)).toBe("subtle");
    expect(documentTypeBadgeColor("")).toBe("subtle");
    expect(documentTypeBadgeColor("Unknown")).toBe("subtle");
  });
});
