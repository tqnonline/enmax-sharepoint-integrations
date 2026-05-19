import {
  makeStyles,
  tokens,
  Input,
  Button,
  Text,
  Avatar,
  Tooltip,
} from "@fluentui/react-components";
import {
  Search24Regular,
  Navigation24Regular,
} from "@fluentui/react-icons";
import { NotificationBell } from "./NotificationBell";
import { useCurrentUser } from "../auth/useCurrentUser";
import { useUiStore } from "../store/uiStore";
import enmaxLogo from "../assets/brand/ENX_Logo_RED.svg";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    height: "52px",
  },
  brand: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, minWidth: 0, overflow: "hidden" },
  logo: { height: "28px", flexShrink: 0 },
  title: { fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  spacer: { flex: 1 },
  search: { flexBasis: "240px", flexShrink: 1, minWidth: "120px" },
  actions: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
});

export function Header() {
  const styles = useStyles();
  const { data: user } = useCurrentUser();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <header className={styles.root}>
      <Tooltip content="Toggle navigation" relationship="label">
        <Button
          appearance="subtle"
          icon={<Navigation24Regular />}
          onClick={toggleSidebar}
          aria-label="Toggle navigation"
        />
      </Tooltip>
      <div className={styles.brand}>
        <img src={enmaxLogo} alt="ENMAX" className={styles.logo} />
        <Text className={styles.title}>AutoCAD Document Numbering</Text>
      </div>
      <div className={styles.spacer} />
      <Input
        className={styles.search}
        contentBefore={<Search24Regular />}
        placeholder="Search…"
        aria-label="Global search"
      />
      <div className={styles.actions}>
        <NotificationBell />
        <Tooltip content={user?.displayName ?? "User"} relationship="label">
          <Avatar name={user?.displayName} />
        </Tooltip>
      </div>
    </header>
  );
}
