import { useAppConfig } from "../../config/useAppConfig";

const RESERVATION_TYPE_DOCUMENT = 2;
const DOCUMENT_SUBTYPE_STANDARD = 1;

function isStandardDocument(
  reservationType?: number | null,
  documentSubtype?: number | null,
): boolean {
  return reservationType === RESERVATION_TYPE_DOCUMENT
    && documentSubtype === DOCUMENT_SUBTYPE_STANDARD;
}

/**
 * Heather model: indexed SharePoint PDFs exist only on
 * - Standard Document: `BB-AA-UU-DDD-SSS-KK-NNNN.pdf` (base drawing record)
 * - Drawing document / Procedure form: `BB-AA-UU-DDD-SSS-KK-NNNN-SSS.pdf` (child sheet)
 */
export function recordCarriesSharePointPdf(
  reservationType?: number | null,
  documentSubtype?: number | null,
  opts?: { isChildSheet?: boolean },
): boolean {
  if (isStandardDocument(reservationType, documentSubtype)) return true;
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

  if (isStandardDocument(input.reservationType, input.documentSubtype)) {
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

/** Prefer drop-off file URL, then destination file URL. */
export function sharePointFileUrl(dropOffUrl?: string, destinationUrl?: string): string {
  return dropOffUrl?.trim() || destinationUrl?.trim() || "";
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
 * URL for embedding the drop-off library in an iframe (Check In modal).
 * `env=WebViewList` requests the lighter SharePoint chrome suited to embedding.
 */
export function buildSharePointLibraryEmbedUrl(libraryBaseUrl: string): string {
  const browse = buildSharePointLibraryBrowseUrl(libraryBaseUrl);
  return browse.includes("?") ? `${browse}&env=WebViewList` : `${browse}?env=WebViewList`;
}

/** Deterministic PDF filename the indexer expects (misnamed uploads are ignored). */
export function expectedPdfFileName(recordNumber: string): string {
  return `${recordNumber.trim()}.pdf`;
}
