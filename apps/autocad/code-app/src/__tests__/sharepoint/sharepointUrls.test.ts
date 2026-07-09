import { describe, expect, it } from "vitest";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
} from "../../features/reserve/terminology";
import {
  expectedPdfFileName,
  recordCarriesSharePointPdf,
  resolveSharePointFileUrls,
  sharePointFileUrl,
} from "../../features/sharepoint/sharepointUrls";

describe("sharepointUrls", () => {
  it("formats expected PDF names from issued numbers", () => {
    expect(expectedPdfFileName("GG-CG-00-ECS-AST-DD-0001")).toBe("GG-CG-00-ECS-AST-DD-0001.pdf");
    expect(expectedPdfFileName("GG-CG-00-ECS-AST-DD-0001-001")).toBe("GG-CG-00-ECS-AST-DD-0001-001.pdf");
  });

  it("only indexes PDFs on standard base or child sheets", () => {
    expect(recordCarriesSharePointPdf(RESERVATION_TYPE_VALUE.Drawing)).toBe(false);
    expect(recordCarriesSharePointPdf(RESERVATION_TYPE_VALUE.Drawing, undefined, { isChildSheet: true })).toBe(true);
    expect(
      recordCarriesSharePointPdf(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard),
    ).toBe(true);
    expect(
      recordCarriesSharePointPdf(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure, { isChildSheet: true }),
    ).toBe(true);
    expect(
      recordCarriesSharePointPdf(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure),
    ).toBe(false);
  });

  it("resolves standard document links from the base drawing record", () => {
    const urls = resolveSharePointFileUrls({
      reservationType: RESERVATION_TYPE_VALUE.Document,
      documentSubtype: DOCUMENT_SUBTYPE_VALUE.Standard,
      isChildSheet: false,
      drawingDropOffUrl: "https://sp.example/standard.pdf",
      sheetDropOffUrl: "https://sp.example/should-not-use.pdf",
    });
    expect(urls.dropOffUrl).toBe("https://sp.example/standard.pdf");
  });

  it("resolves child document links from the sheet only", () => {
    const urls = resolveSharePointFileUrls({
      reservationType: RESERVATION_TYPE_VALUE.Drawing,
      isChildSheet: true,
      sheetDropOffUrl: "https://sp.example/child.pdf",
      drawingDropOffUrl: "https://sp.example/base.pdf",
    });
    expect(urls.dropOffUrl).toBe("https://sp.example/child.pdf");
  });

  it("returns empty urls for drawing base numbers", () => {
    const urls = resolveSharePointFileUrls({
      reservationType: RESERVATION_TYPE_VALUE.Drawing,
      isChildSheet: false,
      drawingDropOffUrl: "https://sp.example/base.pdf",
    });
    expect(sharePointFileUrl(urls.dropOffUrl, urls.destinationUrl)).toBe("");
  });
});
