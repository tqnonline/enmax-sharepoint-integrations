import { Button, Text, tokens, makeStyles } from "@fluentui/react-components";
import { DocumentRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";

const useStyles = makeStyles({
  wrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: tokens.spacingVerticalS, padding: tokens.spacingVerticalXXL, textAlign: "center", color: tokens.colorNeutralForeground3 },
  icon: { fontSize: "32px", color: tokens.colorNeutralForeground4 },
  title: { color: tokens.colorNeutralForeground2, fontWeight: tokens.fontWeightSemibold },
});

interface Props { title: string; subtitle?: string; icon?: ReactElement; actionLabel?: string; onAction?: () => void; }

export function EmptyState({ title, subtitle, icon, actionLabel, onAction }: Props) {
  const styles = useStyles();
  return (
    <div className={styles.wrap}>
      <span className={styles.icon}>{icon ?? <DocumentRegular />}</span>
      <Text className={styles.title}>{title}</Text>
      {subtitle && <Text size={200}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <Button appearance="primary" onClick={onAction} style={{ marginTop: tokens.spacingVerticalS }}>{actionLabel}</Button>
      )}
    </div>
  );
}
