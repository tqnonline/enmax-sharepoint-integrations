import { describe, expect, it } from "vitest";
import { DOCUMENT_SUBTYPE_VALUE, RESERVATION_TYPE_VALUE } from "../../features/reserve/terminology";
import { TAXONOMY_MATRIX, taxonomyMatrixRow } from "./taxonomyMatrix";

describe("taxonomyMatrix", () => {
  it("has exactly one row per known document subtype", () => {
    expect(TAXONOMY_MATRIX).toHaveLength(5);
    const subtypes = TAXONOMY_MATRIX.map((row) => row.documentSubtype).sort((a, b) => a - b);
    expect(subtypes).toEqual([1, 2, 3, 4, 5]);
  });

  it("matches DOCUMENT_SUBTYPE_VALUE ints for every row", () => {
    expect(taxonomyMatrixRow(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.DrawingDocument)?.label)
      .toBe("Drawing Document");
    expect(taxonomyMatrixRow(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.Drawing)?.label)
      .toBe("Drawing");
    expect(taxonomyMatrixRow(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard)?.label)
      .toBe("Standard Document");
    expect(taxonomyMatrixRow(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure)?.label)
      .toBe("Procedure");
    expect(taxonomyMatrixRow(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form)?.label)
      .toBe("Form");
  });

  it("keeps Drawing type rows on the Drawing library pair, Document type rows on Document", () => {
    for (const row of TAXONOMY_MATRIX) {
      if (row.reservationType === RESERVATION_TYPE_VALUE.Drawing) {
        expect(row.libraryPair).toBe("Drawing");
      } else {
        expect(row.libraryPair).toBe("Document");
      }
    }
  });

  it("marks only Drawing and Form as child-producing / existing-sequence-eligible", () => {
    for (const row of TAXONOMY_MATRIX) {
      const isChildProducing = row.documentSubtype === DOCUMENT_SUBTYPE_VALUE.Drawing
        || row.documentSubtype === DOCUMENT_SUBTYPE_VALUE.Form;
      expect(row.createsChildren).toBe(isChildProducing);
      expect(row.existingAllowed).toBe(isChildProducing);
      expect(row.appendAllowed).toBe(isChildProducing);
    }
  });

  it("Drawing Document disallows the Existing sequence type (New only)", () => {
    const row = taxonomyMatrixRow(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.DrawingDocument);
    expect(row?.existingAllowed).toBe(false);
  });

  it("defaults checkout to enabled for every subtype", () => {
    for (const row of TAXONOMY_MATRIX) {
      expect(row.checkoutDefault).toBe(true);
    }
  });
});
