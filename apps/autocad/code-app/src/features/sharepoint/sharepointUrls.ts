import { useAppConfig } from "../../config/useAppConfig";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
  isBaseOnlyDocument,
} from "../reserve/terminology";
import { CheckoutStatus, DrawingState } from "../checkout/api/checkoutClient";
import { SHEET_STATE_AWAITING_VALIDATION } from "../approvals/hooks/useDrawingSheets";

/**
 * Heather model: indexed SharePoint PDFs exist only on
 * - Drawing Document / Standard: `BB-AA-UU-DDD-SSS-KK-NNNN.pdf` (base record)
 * - Procedure: base PDF when forms=0; Form children use `-SSS.pdf` when forms ≥ 1
 * - Drawing / Form: `BB-AA-UU-DDD-SSS-KK-NNNN-SSS.pdf` (child sheet)
 */
export function recordCarriesSharePointPdf(
  reservationType?: number | null,
  documentSubtype?: number | null,
  opts?: { isChildSheet?: boolean },
): boolean {
  if (isBaseOnlyDocument(reservationType, documentSubtype)) return true;
  // Procedure hosts keep a base PDF (forms=0 path) and may also have Form children.
  if (
    reservationType === RESERVATION_TYPE_VALUE.Document
    && documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure
  ) {
    return true;
  }
  return !!opts?.isChildSheet;
}

export interface SharePointFileUrls {
  dropOffUrl: string;
  destinationUrl: string;
}

/** Resolve file-level SharePoint URLs for a searchable/check-out document row. */
export function resolveSharePointFileUrls(input: {
  reservationType?: number | null;
  documentSubtype?: number | null;
  isChildSheet?: boolean;
  sheetDropOffUrl?: string | null;
  sheetDestinationUrl?: string | null;
  drawingDropOffUrl?: string | null;
  drawingDestinationUrl?: string | null;
}): SharePointFileUrls {
  if (!recordCarriesSharePointPdf(input.reservationType, input.documentSubtype, {
    isChildSheet: input.isChildSheet,
  })) {
    return { dropOffUrl: "", destinationUrl: "" };
  }

  const useBaseUrls = isBaseOnlyDocument(input.reservationType, input.documentSubtype)
    || (
      !input.isChildSheet
      && input.reservationType === RESERVATION_TYPE_VALUE.Document
      && input.documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure
    );

  if (useBaseUrls) {
    return {
      dropOffUrl: input.drawingDropOffUrl?.trim() ?? "",
      destinationUrl: input.drawingDestinationUrl?.trim() ?? "",
    };
  }

  return {
    dropOffUrl: input.sheetDropOffUrl?.trim() ?? "",
    destinationUrl: input.sheetDestinationUrl?.trim() ?? "",
  };
}

export function preferSharePointDropOff(opts?: {
  sheetState?: number | null;
  checkoutStatus?: number | null;
  drawingState?: number | null;
}): boolean {
  if (opts?.checkoutStatus === CheckoutStatus.AwaitingValidation) return true;
  if (opts?.sheetState === SHEET_STATE_AWAITING_VALIDATION) return true;
  if (opts?.drawingState === DrawingState.AwaitingValidation) return true;
  return false;
}

/**
 * Prefer destination unless the item is in check-in approval (drop-off).
 * Fall back to the other link when the preferred one is empty.
 */
export function sharePointFileUrl(
  dropOffUrl?: string,
  destinationUrl?: string,
  opts?: { preferDropOff?: boolean },
): string {
  const drop = dropOffUrl?.trim() || "";
  const dest = destinationUrl?.trim() || "";
  if (opts?.preferDropOff) return drop || dest || "";
  return dest || drop || "";
}

/** Drawings site for Drawing reservations; Documents site for Document subtypes. */
export function sharePointSiteForTaxonomy(
  reservationType?: number | null,
): "drawings" | "documents" {
  return reservationType === RESERVATION_TYPE_VALUE.Document ? "documents" : "drawings";
}

/** Surface a grid renders SharePoint links for — controls drop-off vs destination bias. */
export type GridSharePointSurface = "default" | "checkedOutTab" | "checkInQueue";

/**
 * Resolves the link a grid cell should render for a row, based on which surface
 * (tab/queue) the row is shown on. Checked-out/check-in surfaces bias to the
 * drop-off copy (the revision the user is actively reviewing); everywhere else
 * follows the default destination-first behavior.
 */
export function gridSharePointFileUrl(
  urls: SharePointFileUrls,
  opts?: { surface?: GridSharePointSurface },
): string {
  const surface = opts?.surface ?? "default";
  const preferDropOff = surface === "checkedOutTab" || surface === "checkInQueue";
  return sharePointFileUrl(urls.dropOffUrl, urls.destinationUrl, { preferDropOff });
}

export interface TaxonomyLibraryConfig {
  DrawingDropOffLibraryUrl?: string;
  DrawingDestinationLibraryUrl?: string;
  DocumentDropOffLibraryUrl?: string;
  DocumentDestinationLibraryUrl?: string;
  // Legacy per-subtype fallbacks, kept for migration cutover (docs/drawing-document-subtype-CONTRACT.md).
  StandardDocumentDropOffLibraryUrl?: string;
  StandardDocumentDestinationLibraryUrl?: string;
  ProcedureDocumentDropOffLibraryUrl?: string;
  ProcedureDocumentDestinationLibraryUrl?: string;
  FormDocumentDropOffLibraryUrl?: string;
  FormDocumentDestinationLibraryUrl?: string;
  DrawingsDropOffLibraryUrl?: string;
  DrawingsDestinationLibraryUrl?: string;
  DocumentsDropOffLibraryUrl?: string;
  DocumentsDestinationLibraryUrl?: string;
  CheckInUploadLibraryUrl?: string;
}

/**
 * Resolve taxonomy library URLs from AppConfig, keyed by reservation TYPE only
 * (docs/drawing-document-subtype-CONTRACT.md — two pairs: Drawing* covers Drawing
 * Document + Drawing, Document* covers Standard/Procedure/Form). Fallback chain:
 * type pair → legacy Drawings/Documents key → old per-subtype key (Document only)
 * → CheckInUploadLibraryUrl for drop-off only (destination has no legacy
 * single-library equivalent).
 */
export function resolveLibraryUrls(
  reservationType: number | null | undefined,
  documentSubtype: number | null | undefined,
  config: TaxonomyLibraryConfig,
): { dropOff?: string; destination?: string } {
  const isDocument = reservationType === RESERVATION_TYPE_VALUE.Document;

  const typeDropOff = isDocument ? config.DocumentDropOffLibraryUrl : config.DrawingDropOffLibraryUrl;
  const typeDestination = isDocument ? config.DocumentDestinationLibraryUrl : config.DrawingDestinationLibraryUrl;

  const legacyDropOff = isDocument
    ? config.DocumentsDropOffLibraryUrl
    : config.DrawingsDropOffLibraryUrl;
  const legacyDestination = isDocument
    ? config.DocumentsDestinationLibraryUrl
    : config.DrawingsDestinationLibraryUrl;

  let oldSubtypeDropOff: string | undefined;
  let oldSubtypeDestination: string | undefined;
  if (isDocument) {
    if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Standard) {
      oldSubtypeDropOff = config.StandardDocumentDropOffLibraryUrl;
      oldSubtypeDestination = config.StandardDocumentDestinationLibraryUrl;
    } else if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure) {
      oldSubtypeDropOff = config.ProcedureDocumentDropOffLibraryUrl;
      oldSubtypeDestination = config.ProcedureDocumentDestinationLibraryUrl;
    } else if (documentSubtype === DOCUMENT_SUBTYPE_VALUE.Form) {
      oldSubtypeDropOff = config.FormDocumentDropOffLibraryUrl;
      oldSubtypeDestination = config.FormDocumentDestinationLibraryUrl;
    }
  }

  return {
    dropOff: typeDropOff ?? legacyDropOff ?? oldSubtypeDropOff ?? config.CheckInUploadLibraryUrl,
    destination: typeDestination ?? legacyDestination ?? oldSubtypeDestination,
  };
}

/**
 * WS5: resolves the drop-off library base URL for uploads.
 * Accepts either the legacy two-site topology ("drawings" | "documents") or a
 * taxonomy pair (reservation type + document subtype) for finer-grained
 * per-taxonomy library resolution. Falls back to legacy CheckInUploadLibraryUrl.
 */
export function useDropOffLibraryUrl(
  siteOrTaxonomy?:
    | "drawings"
    | "documents"
    | { reservationType?: number | null; documentSubtype?: number | null },
): string | undefined {
  const config = useAppConfig();

  if (typeof siteOrTaxonomy === "object" && siteOrTaxonomy !== null) {
    return resolveLibraryUrls(
      siteOrTaxonomy.reservationType,
      siteOrTaxonomy.documentSubtype,
      config,
    ).dropOff;
  }

  const site = siteOrTaxonomy ?? "drawings";
  const primary =
    site === "documents" ? config.DocumentsDropOffLibraryUrl : config.DrawingsDropOffLibraryUrl;

  return primary ?? config.CheckInUploadLibraryUrl;
}

/** SharePoint "All Items" view — users upload via native UI (new-tab first). */
export function buildSharePointLibraryBrowseUrl(libraryBaseUrl: string): string {
  const trimmed = libraryBaseUrl.replace(/\/$/, "");
  return `${trimmed}/Forms/AllItems.aspx`;
}

/**
 * @deprecated Embed is removed from Check In; browse URL is preferred.
 * Kept for any residual callers / tests.
 */
export function buildSharePointLibraryEmbedUrl(libraryBaseUrl: string): string {
  const browse = buildSharePointLibraryBrowseUrl(libraryBaseUrl);
  return browse.includes("?") ? `${browse}&env=WebViewList` : `${browse}?env=WebViewList`;
}

/** Deterministic PDF filename the indexer expects (misnamed uploads are ignored). */
export function expectedPdfFileName(recordNumber: string): string {
  return `${recordNumber.trim()}.pdf`;
}
