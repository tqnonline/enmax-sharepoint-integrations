import { Text, makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    color: tokens.colorNeutralForeground3,
    padding: tokens.spacingVerticalM,
  },
});

interface PlaceholderProps {
  pageName: string;
  plan: string;
}

export function Placeholder({ pageName, plan }: PlaceholderProps) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <Text weight="semibold" size={400}>{pageName}</Text>
      <Text>Implementation in {plan}. Shell wiring (route, sidebar, breadcrumb) is in place.</Text>
    </div>
  );
}
