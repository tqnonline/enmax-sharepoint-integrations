import { useAppConfig } from "../../config/useAppConfig";
import {
  DOCUMENT_SUBTYPE_VALUE,
  RESERVATION_TYPE_VALUE,
} from "../reserve/terminology";
import { CheckoutStatus, DrawingState } from "../checkout/api/checkoutClient";
import { SHEET_STATE_AWAITING_VALIDATION } from "../approvals/hooks/useDrawingSheets";

function isBaseOnlyDocument(
  reservationType?: number | null,
  documentSubtype?: number | null,
): boolean {
  return reservationType === RESERVATION_TYPE_VALUE.Document
    && (
      documentSubtype === DOCUMENT_SUBTYPE_VALUE.Standard
      || documentSubtype === DOCUMENT_SUBTYPE_VALUE.Procedure
    );
}

/**
 * Heather model: indexed SharePoint PDFs exist only on
 * - Standard / Procedure: `BB-AA-UU-DDD-SSS-KK-NNNN.pdf` (base drawing record)
 * - Drawing document / Form: `BB-AA-UU-DDD-SSS-KK-NNNN-SSS.pdf` (child sheet)
 */
export function recordCarriesSharePointPdf(
  reservationType?: number | null,
  documentSubtype?: number | null,
  opts?: { isChildSheet?: boolean },
): boolean {
  if (isBaseOnlyDocument(reservationType, documentSubtype)) return true;
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

  if (isBaseOnlyDocument(input.reservationType, input.documentSubtype)) {
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

/**
 * WS5: resolves the drop-off library base URL for uploads.
 * Prefers the two-site topology keys; falls back to legacy CheckInUploadLibraryUrl.
 */
export function useDropOffLibraryUrl(site: "drawings" | "documents" = "drawings"): string | undefined {
  const {
    DrawingsDropOffLibraryUrl,
    DocumentsDropOffLibraryUrl,
    CheckInUploadLibraryUrl,
  } = useAppConfig();

  const primary =
    site === "documents" ? DocumentsDropOffLibraryUrl : DrawingsDropOffLibraryUrl;

  return primary ?? CheckInUploadLibraryUrl;
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
