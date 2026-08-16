import { Button, Text, tokens } from "@fluentui/react-components";
import { ArrowUpload24Regular, OpenRegular } from "@fluentui/react-icons";
import {
  buildSharePointLibraryBrowseUrl,
  expectedPdfFileName,
  useDropOffLibraryUrl,
} from "./sharepointUrls";

interface Props {
  recordNumber: string;
  /** Drawings site by default; Standards/Procedures use the Documents site. */
  site?: "drawings" | "documents";
  /** Per-taxonomy library resolution; takes precedence over `site` when provided. */
  reservationType?: number | null;
  documentSubtype?: number | null;
  /** When false the upload entry point is hidden (e.g. gated Check Out not yet approved). */
  enabled?: boolean;
}

/**
 * WS5d: opens the native SharePoint drop-off library in a new tab (guaranteed path).
 * Users upload PDFs with the deterministic filename; the indexer links them on the next sweep.
 */
export function SharePointUploadButton({
  recordNumber,
  site = "drawings",
  reservationType,
  documentSubtype,
  enabled = true,
}: Props) {
  const libraryUrl = useDropOffLibraryUrl(
    reservationType !== undefined || documentSubtype !== undefined
      ? { reservationType, documentSubtype }
      : site,
  );

  if (!enabled || !libraryUrl) return null;

  const browseUrl = buildSharePointLibraryBrowseUrl(libraryUrl);
  const fileName = expectedPdfFileName(recordNumber);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS }}>
      <Button
        as="a"
        href={browseUrl}
        target="_blank"
        rel="noopener noreferrer"
        icon={<ArrowUpload24Regular />}
        appearance="secondary"
      >
        Upload PDF to SharePoint
      </Button>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        Name the file{" "}
        <Text weight="semibold" style={{ fontFamily: "monospace" }}>{fileName}</Text>
        {" "}in the drop-off library.{" "}
        <OpenRegular style={{ verticalAlign: "middle" }} aria-hidden />
      </Text>
    </div>
  );
}
