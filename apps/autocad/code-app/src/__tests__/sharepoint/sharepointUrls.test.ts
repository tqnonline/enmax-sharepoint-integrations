import { describe, expect, it } from "vitest";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
} from "../../features/reserve/terminology";
import { CheckoutStatus, DrawingState } from "../../features/checkout/api/checkoutClient";
import { SHEET_STATE_AWAITING_VALIDATION } from "../../features/approvals/hooks/useDrawingSheets";
import {
  expectedPdfFileName,
  preferSharePointDropOff,
  recordCarriesSharePointPdf,
  resolveSharePointFileUrls,
  sharePointFileUrl,
  sharePointSiteForTaxonomy,
} from "../../features/sharepoint/sharepointUrls";

describe("sharepointUrls", () => {
  it("formats expected PDF names from issued numbers", () => {
    expect(expectedPdfFileName("GG-CG-00-ECS-AST-DD-0001")).toBe("GG-CG-00-ECS-AST-DD-0001.pdf");
    expect(expectedPdfFileName("GG-CG-00-ECS-AST-DD-0001-001")).toBe("GG-CG-00-ECS-AST-DD-0001-001.pdf");
  });

  it("indexes PDFs on standard/procedure bases or child sheets", () => {
    expect(recordCarriesSharePointPdf(RESERVATION_TYPE_VALUE.Drawing)).toBe(false);
    expect(recordCarriesSharePointPdf(RESERVATION_TYPE_VALUE.Drawing, undefined, { isChildSheet: true })).toBe(true);
    expect(
      recordCarriesSharePointPdf(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard),
    ).toBe(true);
    expect(
      recordCarriesSharePointPdf(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure),
    ).toBe(true);
    expect(
      recordCarriesSharePointPdf(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form),
    ).toBe(false);
    expect(
      recordCarriesSharePointPdf(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form, { isChildSheet: true }),
    ).toBe(true);
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

  it("prefers destination unless awaiting check-in validation", () => {
    expect(sharePointFileUrl("https://drop", "https://dest")).toBe("https://dest");
    expect(sharePointFileUrl("https://drop", "https://dest", { preferDropOff: true })).toBe("https://drop");
    expect(sharePointFileUrl("https://drop", "", { preferDropOff: false })).toBe("https://drop");
    expect(sharePointFileUrl("", "https://dest", { preferDropOff: true })).toBe("https://dest");
  });

  it("detects drop-off preference from checkout/sheet/drawing state", () => {
    expect(preferSharePointDropOff({ checkoutStatus: CheckoutStatus.AwaitingValidation })).toBe(true);
    expect(preferSharePointDropOff({ sheetState: SHEET_STATE_AWAITING_VALIDATION })).toBe(true);
    expect(preferSharePointDropOff({ drawingState: DrawingState.AwaitingValidation })).toBe(true);
    expect(preferSharePointDropOff({ checkoutStatus: CheckoutStatus.Open })).toBe(false);
  });

  it("maps document taxonomy to the documents SharePoint site", () => {
    expect(sharePointSiteForTaxonomy(RESERVATION_TYPE_VALUE.Drawing)).toBe("drawings");
    expect(sharePointSiteForTaxonomy(RESERVATION_TYPE_VALUE.Document)).toBe("documents");
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
