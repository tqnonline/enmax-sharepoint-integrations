import { describe, expect, it } from "vitest";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
  checkoutBulkLabel,
  checkoutSelectedLabel,
  checkoutSingleLabel,
  reserveTerminology,
  reservationChildNoun,
  reservationChildNounPluralLower,
  reservationChildNounSingularLower,
  reservationHasChildItems,
  reservationRecordsLabel,
} from "../../features/reserve/terminology";

describe("reserveTerminology", () => {
  it("Drawing Document is base-only with no child noun", () => {
    const term = reserveTerminology("Drawing", "DrawingDocument");
    expect(term).toMatchObject({
      typeLabel: "Drawing Document",
      baseNoun: "drawing document",
      baseNounPlural: "drawing documents",
      childNoun: null,
      createsChildren: false,
    });
  });

  it("Drawing produces numbered Drawing Sheet children", () => {
    const term = reserveTerminology("Drawing", "Drawing");
    expect(term).toMatchObject({
      typeLabel: "Drawing",
      baseNoun: "drawing number",
      baseNounPlural: "drawing numbers",
      childNoun: "Drawing Sheet",
      createsChildren: true,
    });
  });

  it("falls back to the Drawing terminology when no subtype is set (legacy rows)", () => {
    const term = reserveTerminology("Drawing", undefined);
    expect(term.createsChildren).toBe(true);
    expect(term.typeLabel).toBe("Drawing");
  });

  it("Standard is base-only; Procedure may carry Form children", () => {
    expect(reserveTerminology("Document", "Standard")).toMatchObject({
      typeLabel: "Standard",
      baseNoun: "standard",
      childNoun: null,
      createsChildren: false,
    });
    expect(reserveTerminology("Document", "Procedure")).toMatchObject({
      typeLabel: "Procedure",
      baseNoun: "procedure",
      childNoun: "Form",
      createsChildren: true,
    });
  });

  it("Form produces numbered Form children", () => {
    const term = reserveTerminology("Document", "Form");
    expect(term).toMatchObject({
      typeLabel: "Form",
      baseNoun: "form",
      childNoun: "Form",
      createsChildren: true,
    });
  });
});

describe("reservationRecordsLabel", () => {
  it("labels Drawing/Drawing Document rows as Drawings", () => {
    expect(reservationRecordsLabel(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.DrawingDocument)).toBe("Drawings");
    expect(reservationRecordsLabel(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.Drawing)).toBe("Drawings");
  });

  it("labels each Document subtype distinctly", () => {
    expect(reservationRecordsLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard)).toBe("Standards");
    expect(reservationRecordsLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure)).toBe("Procedures");
    expect(reservationRecordsLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form)).toBe("Forms");
  });
});

describe("reservationHasChildItems", () => {
  it("is false for base-only subtypes (Drawing Document, Standard)", () => {
    expect(reservationHasChildItems(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.DrawingDocument)).toBe(false);
    expect(reservationHasChildItems(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard)).toBe(false);
  });

  it("is true for child-producing subtypes (Drawing, Procedure, Form)", () => {
    expect(reservationHasChildItems(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.Drawing)).toBe(true);
    expect(reservationHasChildItems(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure)).toBe(true);
    expect(reservationHasChildItems(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form)).toBe(true);
  });
});

describe("reservationChildNoun helpers", () => {
  it("derives singular/plural lowercase child nouns per taxonomy", () => {
    expect(reservationChildNoun(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.Drawing)).toBe("Drawing Sheet");
    expect(reservationChildNounSingularLower(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.Drawing)).toBe("drawing sheet");
    expect(reservationChildNounPluralLower(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form)).toBe("forms");
  });
});

describe("checkoutBulkLabel", () => {
  it("uses Standards / Procedures bulk labels", () => {
    expect(checkoutBulkLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard, undefined, true))
      .toBe("Request Check Out — All Standards");
    expect(checkoutBulkLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure, undefined, false))
      .toBe("Check Out All Procedures");
  });

  it("uses the pluralized child noun for Drawing sheets / Drawing Document / Form", () => {
    expect(checkoutBulkLabel(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.Drawing, undefined, true))
      .toBe("Request Check Out — All Drawing Sheets");
    expect(checkoutBulkLabel(RESERVATION_TYPE_VALUE.Drawing, DOCUMENT_SUBTYPE_VALUE.DrawingDocument, undefined, false))
      .toBe("Check Out — All Drawing Documents");
    expect(checkoutBulkLabel(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form, undefined, true))
      .toBe("Request Check Out — All Forms");
  });
});

describe("checkoutSingleLabel / checkoutSelectedLabel", () => {
  it("toggles verb by requireApproval and formats the selected count", () => {
    expect(checkoutSingleLabel(true)).toBe("Request Check Out");
    expect(checkoutSingleLabel(false)).toBe("Check Out");
    expect(checkoutSelectedLabel(3, true)).toBe("Request Check Out (3)");
    expect(checkoutSelectedLabel(3, false)).toBe("Check Out (3)");
  });
});
