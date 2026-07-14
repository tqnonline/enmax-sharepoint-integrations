import { describe, expect, it } from "vitest";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
} from "../../features/reserve/terminology";
import { CheckoutStatus, DrawingState } from "../../features/checkout/api/checkoutClient";
import { SHEET_STATE_AWAITING_VALIDATION } from "../../features/approvals/hooks/useDrawingSheets";
import {
  expectedPdfFileName,
  gridSharePointFileUrl,
  preferSharePointDropOff,
  recordCarriesSharePointPdf,
  resolveLibraryUrls,
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

  describe("gridSharePointFileUrl", () => {
    const urls = { dropOffUrl: "https://drop", destinationUrl: "https://dest" };

    it("defaults to destination-first", () => {
      expect(gridSharePointFileUrl(urls)).toBe("https://dest");
      expect(gridSharePointFileUrl(urls, { surface: "default" })).toBe("https://dest");
    });

    it("prefers drop-off on the checked-out tab and check-in queue surfaces", () => {
      expect(gridSharePointFileUrl(urls, { surface: "checkedOutTab" })).toBe("https://drop");
      expect(gridSharePointFileUrl(urls, { surface: "checkInQueue" })).toBe("https://drop");
    });

    it("falls back to the other link when the preferred one is empty", () => {
      expect(gridSharePointFileUrl({ dropOffUrl: "", destinationUrl: "https://dest" }, { surface: "checkedOutTab" }))
        .toBe("https://dest");
      expect(gridSharePointFileUrl({ dropOffUrl: "https://drop", destinationUrl: "" })).toBe("https://drop");
    });
  });

  describe("resolveLibraryUrls", () => {
    const config = {
      DrawingDropOffLibraryUrl: "https://sp.example/drawing-dropoff",
      DrawingDestinationLibraryUrl: "https://sp.example/drawing-dest",
      StandardDocumentDropOffLibraryUrl: "https://sp.example/standard-dropoff",
      StandardDocumentDestinationLibraryUrl: "https://sp.example/standard-dest",
      ProcedureDocumentDropOffLibraryUrl: "https://sp.example/procedure-dropoff",
      ProcedureDocumentDestinationLibraryUrl: "https://sp.example/procedure-dest",
      FormDocumentDropOffLibraryUrl: "https://sp.example/form-dropoff",
      FormDocumentDestinationLibraryUrl: "https://sp.example/form-dest",
      DrawingsDropOffLibraryUrl: "https://sp.example/legacy-drawings-dropoff",
      DrawingsDestinationLibraryUrl: "https://sp.example/legacy-drawings-dest",
      DocumentsDropOffLibraryUrl: "https://sp.example/legacy-documents-dropoff",
      DocumentsDestinationLibraryUrl: "https://sp.example/legacy-documents-dest",
      CheckInUploadLibraryUrl: "https://sp.example/checkin-upload",
    };

    it("resolves taxonomy-specific keys per reservation type / document subtype", () => {
      expect(resolveLibraryUrls(RESERVATION_TYPE_VALUE.Drawing, undefined, config)).toEqual({
        dropOff: config.DrawingDropOffLibraryUrl,
        destination: config.DrawingDestinationLibraryUrl,
      });
      expect(resolveLibraryUrls(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard, config)).toEqual({
        dropOff: config.StandardDocumentDropOffLibraryUrl,
        destination: config.StandardDocumentDestinationLibraryUrl,
      });
      expect(resolveLibraryUrls(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Procedure, config)).toEqual({
        dropOff: config.ProcedureDocumentDropOffLibraryUrl,
        destination: config.ProcedureDocumentDestinationLibraryUrl,
      });
      expect(resolveLibraryUrls(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Form, config)).toEqual({
        dropOff: config.FormDocumentDropOffLibraryUrl,
        destination: config.FormDocumentDestinationLibraryUrl,
      });
    });

    it("falls back to legacy Drawings/Documents keys when taxonomy keys are absent", () => {
      const legacyOnly = {
        DrawingsDropOffLibraryUrl: config.DrawingsDropOffLibraryUrl,
        DrawingsDestinationLibraryUrl: config.DrawingsDestinationLibraryUrl,
        DocumentsDropOffLibraryUrl: config.DocumentsDropOffLibraryUrl,
        DocumentsDestinationLibraryUrl: config.DocumentsDestinationLibraryUrl,
      };
      expect(resolveLibraryUrls(RESERVATION_TYPE_VALUE.Drawing, undefined, legacyOnly)).toEqual({
        dropOff: legacyOnly.DrawingsDropOffLibraryUrl,
        destination: legacyOnly.DrawingsDestinationLibraryUrl,
      });
      expect(resolveLibraryUrls(RESERVATION_TYPE_VALUE.Document, DOCUMENT_SUBTYPE_VALUE.Standard, legacyOnly)).toEqual({
        dropOff: legacyOnly.DocumentsDropOffLibraryUrl,
        destination: legacyOnly.DocumentsDestinationLibraryUrl,
      });
    });

    it("falls back to CheckInUploadLibraryUrl for drop-off when no taxonomy or legacy key is set", () => {
      const checkInOnly = { CheckInUploadLibraryUrl: config.CheckInUploadLibraryUrl };
      expect(resolveLibraryUrls(RESERVATION_TYPE_VALUE.Drawing, undefined, checkInOnly)).toEqual({
        dropOff: config.CheckInUploadLibraryUrl,
        destination: undefined,
      });
    });

    it("returns undefined for both links when no config key is set", () => {
      expect(resolveLibraryUrls(RESERVATION_TYPE_VALUE.Drawing, undefined, {})).toEqual({
        dropOff: undefined,
        destination: undefined,
      });
    });
  });
});
