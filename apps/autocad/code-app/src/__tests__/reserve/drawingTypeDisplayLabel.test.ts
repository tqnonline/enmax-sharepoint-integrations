import { describe, expect, it } from "vitest";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
  documentDisplayNumber,
  drawingTypeDisplayLabel,
  reservationTypeDisplayLabel,
} from "../../features/reserve/terminology";
import { typeLabelForDrawingRow } from "../../lib/drawingTaxonomy";

describe("drawingTypeDisplayLabel", () => {
  it("uses drawing taxonomy when present", () => {
    expect(
      drawingTypeDisplayLabel(
        {
          enmax_acdnreservationtype: RESERVATION_TYPE_VALUE.Document,
          enmax_acdndocumentsubtype: DOCUMENT_SUBTYPE_VALUE.Procedure,
        },
        {
          enmax_acdnreservationtype: RESERVATION_TYPE_VALUE.Drawing,
          enmax_acdndocumentsubtype: null,
        },
      ),
    ).toBe("Procedure");
  });

  it("falls back to reservation when drawing taxonomy is null", () => {
    expect(
      drawingTypeDisplayLabel(
        { enmax_acdnreservationtype: null, enmax_acdndocumentsubtype: null },
        {
          enmax_acdnreservationtype: RESERVATION_TYPE_VALUE.Document,
          enmax_acdndocumentsubtype: DOCUMENT_SUBTYPE_VALUE.Procedure,
        },
      ),
    ).toBe("Procedure");
  });

  it("defaults to Drawing when both are missing", () => {
    expect(drawingTypeDisplayLabel({}, null)).toBe("Drawing");
    expect(reservationTypeDisplayLabel(null, null)).toBe("Drawing");
  });
});

describe("typeLabelForDrawingRow", () => {
  it("resolves from linked reservation when drawing fields are empty", () => {
    const map = new Map([
      [
        "res-1",
        {
          enmax_acdnreservationtype: RESERVATION_TYPE_VALUE.Document,
          enmax_acdndocumentsubtype: DOCUMENT_SUBTYPE_VALUE.Procedure,
        },
      ],
    ]);
    expect(
      typeLabelForDrawingRow(
        {
          _enmax_acdnreservation_value: "res-1",
          enmax_acdnreservationtype: undefined,
          enmax_acdndocumentsubtype: undefined,
        },
        map,
      ),
    ).toBe("Procedure");
  });
});

describe("documentDisplayNumber", () => {
  it("adds a 3-digit sheet suffix for drawing/form taxonomies", () => {
    expect(
      documentDisplayNumber(
        "GG-CG-00-ECS-AST-DD-0001",
        7,
        RESERVATION_TYPE_VALUE.Drawing,
        undefined,
      ),
    ).toBe("GG-CG-00-ECS-AST-DD-0001-007");
    expect(
      documentDisplayNumber(
        "GG-CG-00-ECS-AST-DD-0001",
        7,
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Form,
      ),
    ).toBe("GG-CG-00-ECS-AST-DD-0001-007");
  });

  it("keeps standard and procedure display at the base number", () => {
    expect(
      documentDisplayNumber(
        "GG-CG-00-ECS-AST-DD-0001",
        7,
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Standard,
      ),
    ).toBe("GG-CG-00-ECS-AST-DD-0001");
    expect(
      documentDisplayNumber(
        "GG-CG-00-ECS-AST-DD-0001",
        7,
        RESERVATION_TYPE_VALUE.Document,
        DOCUMENT_SUBTYPE_VALUE.Procedure,
      ),
    ).toBe("GG-CG-00-ECS-AST-DD-0001");
  });
});
