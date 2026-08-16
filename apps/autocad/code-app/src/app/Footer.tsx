import { makeStyles, tokens, Text } from "@fluentui/react-components";
import { useAppConfig } from "../config/useAppConfig";
import { APP_VERSION, APP_BUILD_DATE } from "../lib/version";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
  },
  left: { display: "flex", gap: tokens.spacingHorizontalM, alignItems: "center", flexShrink: 0 },
  disclaimer: { flex: "1 1 auto", minWidth: 0, textAlign: "center" },
  copyright: { flexShrink: 0 },
});

export function Footer() {
  const styles = useStyles();
  const config = useAppConfig();

  return (
    <footer className={styles.root}>
      <div className={styles.left}>
        <Text size={100}>v{APP_VERSION}</Text>
        <Text size={100}>{APP_BUILD_DATE}</Text>
      </div>
      <Text size={100} className={styles.disclaimer}>{config.FooterDisclaimer}</Text>
      <Text size={100} className={styles.copyright}>{config.FooterCopyright}</Text>
    </footer>
  );
}
