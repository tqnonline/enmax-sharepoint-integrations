import { Spinner, makeStyles, tokens } from "@fluentui/react-components";
import enmaxLogo from "../assets/brand/ENX_Logo_RED.svg";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    gap: tokens.spacingVerticalXL,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  logo: { height: "48px" },
});

export function AppLoadingSplash() {
  const styles = useStyles();
  return (
    <div className={styles.root} role="status" aria-label="Loading application">
      <img src={enmaxLogo} alt="ENMAX" className={styles.logo} />
      <Spinner label="Loading…" size="large" />
    </div>
  );
}
