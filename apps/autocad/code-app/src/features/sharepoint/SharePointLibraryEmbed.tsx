import { Link, Text, tokens, makeStyles } from "@fluentui/react-components";
import { OpenRegular } from "@fluentui/react-icons";
import {
  buildSharePointLibraryBrowseUrl,
  buildSharePointLibraryEmbedUrl,
  expectedPdfFileName,
  useDropOffLibraryUrl,
} from "./sharepointUrls";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  frameWrap: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground2,
    minHeight: "320px",
  },
  frame: {
    display: "block",
    width: "100%",
    height: "360px",
    border: "none",
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
  openLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
    fontSize: tokens.fontSizeBase200,
  },
});

interface Props {
  recordNumber: string;
  site?: "drawings" | "documents";
  enabled?: boolean;
}

/**
 * Embeds the SharePoint drop-off library in the Check In modal so users upload
 * without leaving the app. Falls back to an open-in-new-tab link when embed is
 * blocked by tenant policy.
 */
export function SharePointLibraryEmbed({
  recordNumber,
  site = "drawings",
  enabled = true,
}: Props) {
  const styles = useStyles();
  const libraryUrl = useDropOffLibraryUrl(site);

  if (!enabled || !libraryUrl) return null;

  const embedUrl = buildSharePointLibraryEmbedUrl(libraryUrl);
  const browseUrl = buildSharePointLibraryBrowseUrl(libraryUrl);
  const fileName = expectedPdfFileName(recordNumber);

  return (
    <div className={styles.root}>
      <Text size={200} className={styles.hint}>
        Upload{" "}
        <Text weight="semibold" style={{ fontFamily: "monospace" }}>{fileName}</Text>
        {" "}to the drop-off library below.
      </Text>
      <div className={styles.frameWrap}>
        <iframe
          className={styles.frame}
          src={embedUrl}
          title={`SharePoint drop-off library for ${recordNumber}`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        />
      </div>
      <Link href={browseUrl} target="_blank" rel="noopener noreferrer" className={styles.openLink}>
        Open library in new tab <OpenRegular aria-hidden />
      </Link>
    </div>
  );
}
