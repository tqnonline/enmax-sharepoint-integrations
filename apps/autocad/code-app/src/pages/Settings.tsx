import {
  makeStyles,
  tokens,
  Text,
  Radio,
  RadioGroup,
  Label,
} from "@fluentui/react-components";
import { useUiStore } from "../store/uiStore";

const useStyles = makeStyles({
  root: { padding: tokens.spacingVerticalL },
  section: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
});

export default function Settings() {
  const styles = useStyles();
  const themeOverride = useUiStore((s) => s.themeOverride);
  const setThemeOverride = useUiStore((s) => s.setThemeOverride);

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <Label weight="semibold">Theme</Label>
        <RadioGroup
          value={themeOverride ?? "system"}
          onChange={(_, d) =>
            setThemeOverride(d.value === "system" ? null : (d.value as "light" | "dark"))
          }
        >
          <Radio value="system" label="System (follow OS preference)" />
          <Radio value="light" label="Light" />
          <Radio value="dark" label="Dark" />
        </RadioGroup>
      </div>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        Additional settings ship in plan #08 (notification preferences).
      </Text>
    </div>
  );
}
