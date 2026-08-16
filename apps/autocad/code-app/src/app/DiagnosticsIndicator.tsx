import { Button, makeStyles, tokens } from "@fluentui/react-components";
import { BugRegular, DismissRegular } from "@fluentui/react-icons";
import { useDiagnostics } from "../lib/diagnostics";

const useStyles = makeStyles({
  chip: {
    position: "fixed",
    bottom: tokens.spacingVerticalM,
    right: tokens.spacingHorizontalM,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground1,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusCircular,
    boxShadow: tokens.shadow8,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
});

// Persistent reminder that Diagnostics Mode is logging to the console, with a
// one-click off so it's never left running unnoticed.
export function DiagnosticsIndicator() {
  const styles = useStyles();
  const { on, setOn } = useDiagnostics();
  if (!on) return null;

  return (
    <div className={styles.chip} role="status" aria-label="Diagnostics Mode is on">
      <BugRegular />
      <span>Diagnostics on</span>
      <Button
        appearance="transparent"
        size="small"
        icon={<DismissRegular />}
        onClick={() => setOn(false)}
        aria-label="Turn off Diagnostics Mode"
        title="Turn off Diagnostics Mode"
        style={{ color: tokens.colorPaletteRedForeground1, minWidth: "auto" }}
      />
    </div>
  );
}
