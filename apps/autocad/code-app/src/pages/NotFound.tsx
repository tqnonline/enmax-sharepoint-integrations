import { Link } from "react-router-dom";
import { MessageBar, MessageBarBody, MessageBarTitle, Button } from "@fluentui/react-components";
import { makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    padding: tokens.spacingVerticalXXXL,
  },
});

export default function NotFound() {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <MessageBar intent="error" style={{ maxWidth: "480px" }}>
        <MessageBarBody>
          <MessageBarTitle>Page not found</MessageBarTitle>
          The page you requested doesn't exist.{" "}
          <Link to="/" style={{ color: "inherit" }}>
            <Button appearance="transparent" size="small">Go home</Button>
          </Link>
        </MessageBarBody>
      </MessageBar>
    </div>
  );
}
