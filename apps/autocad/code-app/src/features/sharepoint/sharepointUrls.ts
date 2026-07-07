import { useAppConfig } from "../../config/useAppConfig";

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

/** Deterministic PDF filename the indexer expects (misnamed uploads are ignored). */
export function expectedPdfFileName(recordNumber: string): string {
  return `${recordNumber.trim()}.pdf`;
}
