import { useSearchParams, Link } from "react-router-dom";
import {
  Title2,
  Text,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  Button,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { CheckmarkCircle24Regular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalL,
    paddingTop: tokens.spacingVerticalXXL,
  },
  icon: { color: tokens.colorPaletteGreenForeground1, fontSize: "48px" },
});

export function ReserveSuccess() {
  const styles = useStyles();
  const [params] = useSearchParams();
  const id = params.get("id");

  return (
    <div className={styles.root}>
      <CheckmarkCircle24Regular className={styles.icon} fontSize={48} />
      <Title2>Reservation submitted</Title2>
      {id && (
        <Text>
          Reservation ID: <strong>{id}</strong>
        </Text>
      )}
      <MessageBar intent="info">
        <MessageBarBody>
          Your reservation is pending approval. You will be notified by email, Teams, and
          in-app notification once an approver reviews it.
        </MessageBarBody>
        <MessageBarActions>
          <Link to="/" style={{ textDecoration: "none" }}>
            <Button appearance="primary">Return home</Button>
          </Link>
          <Link to="/reserve" style={{ textDecoration: "none" }}>
            <Button appearance="secondary">Submit another</Button>
          </Link>
        </MessageBarActions>
      </MessageBar>
    </div>
  );
}
