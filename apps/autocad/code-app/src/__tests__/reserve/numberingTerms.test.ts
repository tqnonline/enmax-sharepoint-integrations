import { describe, expect, it } from "vitest";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
  reserveTerminology,
} from "../../features/reserve/terminology";
import {
  NUMBERING_GROUP_LABEL,
  NUMBERING_GROUP_PATTERN,
  baseNumberLabel,
  formatBaseSequenceRange,
  formatNumberingGroup,
  individualItemLabel,
  individualItemLabelPlural,
  numberRangeLabel,
  taxonomyTypeLabel,
} from "../../features/reserve/numberingTerms";

describe("numberingTerms", () => {
  it("exposes Heather numbering group label and pattern", () => {
    expect(NUMBERING_GROUP_LABEL).toBe("Drawing/Document Numbering Group");
    expect(NUMBERING_GROUP_PATTERN).toBe("BB-AA-UU-DDD-SSS-KK");
  });

  it("maps taxonomy to type labels", () => {
    expect(taxonomyTypeLabel(RESERVATION_TYPE_VALUE.Drawing)).toBe("Drawing");
    expect(
      taxonomyTypeLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard),
    ).toBe("Standard Document");
    expect(
      taxonomyTypeLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure),
    ).toBe("Procedure");
    expect(
      taxonomyTypeLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form),
    ).toBe("Form");
  });

  it("maps taxonomy to base number and range labels", () => {
    expect(baseNumberLabel(RESERVATION_TYPE_VALUE.Drawing)).toBe("Drawing Number");
    expect(
      baseNumberLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard),
    ).toBe("Standard Document");
    expect(numberRangeLabel(RESERVATION_TYPE_VALUE.Drawing)).toBe("Drawing Number Range");
    expect(
      numberRangeLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form),
    ).toBe("Form Number Range");
    expect(
      numberRangeLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure),
    ).toBeNull();
    expect(
      numberRangeLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard),
    ).toBeNull();
  });

  it("maps taxonomy to individual item labels", () => {
    expect(individualItemLabel(RESERVATION_TYPE_VALUE.Drawing)).toBe("Drawing Document");
    expect(
      individualItemLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard),
    ).toBe("Standard Document");
    expect(
      individualItemLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure),
    ).toBe("Procedure");
    expect(
      individualItemLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form),
    ).toBe("Form");
    expect(individualItemLabelPlural(RESERVATION_TYPE_VALUE.Drawing)).toBe("Drawing Documents");
    expect(
      individualItemLabelPlural(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form),
    ).toBe("Forms");
  });

  it("marks Standard and Procedure as base-only; Form creates children", () => {
    expect(reserveTerminology("Document", "Standard").createsChildren).toBe(false);
    expect(reserveTerminology("Document", "Procedure").createsChildren).toBe(false);
    expect(reserveTerminology("Document", "Form").createsChildren).toBe(true);
    expect(reserveTerminology("Drawing", undefined).createsChildren).toBe(true);
  });

  it("formats numbering group without NNNN suffix", () => {
    expect(
      formatNumberingGroup({
        businessCode: "GG",
        assetCode: "CG",
        unitCode: "00",
        domainCode: "ECS",
        systemCode: "AST",
        kindCode: "DD",
      }),
    ).toBe("GG-CG-00-ECS-AST-DD");
  });

  it("formats base sequence range with business 'to' word", () => {
    expect(formatBaseSequenceRange(1, 1)).toBe("0001");
    expect(formatBaseSequenceRange(1, 5)).toBe("0001 To 0005");
  });
});
