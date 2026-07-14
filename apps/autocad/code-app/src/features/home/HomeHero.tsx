import { Title2, Text, tokens, makeStyles } from "@fluentui/react-components";
import { greeting, displayName as formatDisplayName } from "./homeUtils";

const useStyles = makeStyles({
  hero: {
    paddingLeft: tokens.spacingHorizontalL,
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    borderLeftColor: tokens.colorBrandForeground1,
  },
  name: { color: tokens.colorBrandForeground1 },
  status: {
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
    display: "block",
  },
});

interface Props {
  fullName?: string;
  /** Role-aware, pre-composed status summary ("2 open check-outs · 1 pending reservation"). */
  statusLine: string;
}

export function HomeHero({ fullName, statusLine }: Props) {
  const styles = useStyles();
  const hour = new Date().getHours();
  return (
    <div className={styles.hero}>
      <Title2 as="h1">
        {greeting(hour)}, <span className={styles.name}>{formatDisplayName(fullName)}</span>
      </Title2>
      <Text size={300} className={styles.status}>{statusLine}</Text>
    </div>
  );
}
