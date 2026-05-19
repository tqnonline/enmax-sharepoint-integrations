import { type ReactNode } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    minHeight: "40px",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
});

interface CommandBarProps {
  children?: ReactNode;
}

// Renders per-destination command actions. Feature pages pass children via
// context in plans #05–#08. This plan renders an empty bar.
export function CommandBar({ children }: CommandBarProps) {
  const styles = useStyles();
  if (!children) return null;
  return (
    <div className={styles.root} role="toolbar" aria-label="Commands">
      {children}
    </div>
  );
}
