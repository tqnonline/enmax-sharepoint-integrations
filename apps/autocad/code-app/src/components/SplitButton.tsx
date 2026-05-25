import { Button, Menu, MenuTrigger, MenuButton, MenuPopover, MenuList, MenuItem, makeStyles, tokens } from "@fluentui/react-components";
import type { ReactElement } from "react";

export interface SplitMenuItem { key: string; label: string; onClick: () => void; disabled?: boolean; }

const useStyles = makeStyles({
  group: { display: "inline-flex" },
  primary: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  caret: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, minWidth: "auto", padding: `0 ${tokens.spacingHorizontalXS}` },
});

interface Props {
  primaryLabel: string;
  primaryIcon?: ReactElement;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  appearance?: "primary" | "secondary" | "outline";
  items: SplitMenuItem[];
}

export function SplitButton({ primaryLabel, primaryIcon, onPrimary, primaryDisabled, primaryLoading, appearance = "primary", items }: Props) {
  const styles = useStyles();
  return (
    <div className={styles.group}>
      <Button appearance={appearance} icon={primaryIcon} className={styles.primary} onClick={onPrimary} disabled={primaryDisabled || primaryLoading}>{primaryLabel}</Button>
      {items.length > 0 && (
        <Menu positioning="below-end">
          <MenuTrigger disableButtonEnhancement>
            <MenuButton appearance={appearance} className={styles.caret} aria-label="More actions" />
          </MenuTrigger>
          <MenuPopover><MenuList>
            {items.map(i => <MenuItem key={i.key} disabled={i.disabled} onClick={i.onClick}>{i.label}</MenuItem>)}
          </MenuList></MenuPopover>
        </Menu>
      )}
    </div>
  );
}
