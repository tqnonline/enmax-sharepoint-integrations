import { Button, Text, tokens, makeStyles } from "@fluentui/react-components";
import { OpenRegular } from "@fluentui/react-icons";
import {
  buildSharePointLibraryBrowseUrl,
  expectedPdfFileName,
  useDropOffLibraryUrl,
} from "./sharepointUrls";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    width: "100%",
    padding: `0 ${tokens.spacingHorizontalL}`,
    boxSizing: "border-box",
  },
  callout: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusMedium,
    border: `2px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  hint: {
    color: tokens.colorNeutralForeground1,
  },
  fileName: {
    fontFamily: "monospace",
  },
  openButton: {
    alignSelf: "flex-start",
  },
});

interface Props {
  recordNumber: string;
  site?: "drawings" | "documents";
  enabled?: boolean;
}

/**
 * Highly visible link to the SharePoint drop-off library for Check In uploads.
 * Replaces the former iframe embed (tenant policy often blocked embedding).
 */
export function SharePointLibraryEmbed({
  recordNumber,
  site = "drawings",
  enabled = true,
}: Props) {
  const styles = useStyles();
  const libraryUrl = useDropOffLibraryUrl(site);

  if (!enabled || !libraryUrl) return null;

  const browseUrl = buildSharePointLibraryBrowseUrl(libraryUrl);
  const fileName = expectedPdfFileName(recordNumber);

  return (
    <div className={styles.root}>
      <div className={styles.callout}>
        <Text size={300} weight="semibold" className={styles.hint}>
          Upload your revised PDF to the drop-off library
        </Text>
        <Text size={200} className={styles.hint}>
          Open the library and upload{" "}
          <Text weight="semibold" className={styles.fileName}>{fileName}</Text>
          {" "}exactly (filename must match).
        </Text>
        <Button
          as="a"
          href={browseUrl}
          target="_blank"
          rel="noopener noreferrer"
          appearance="primary"
          size="large"
          icon={<OpenRegular />}
          className={styles.openButton}
        >
          Open drop-off library
        </Button>
      </div>
    </div>
  );
}
