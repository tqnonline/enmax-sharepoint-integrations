import { useSearchParams, Link } from "react-router-dom";
import {
  Title2,
  Text,
  Badge,
  Button,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { CheckmarkCircle24Filled } from "@fluentui/react-icons";

const FADE_UP = {
  from: { opacity: "0", transform: "translateY(8px)" },
  to:   { opacity: "1", transform: "translateY(0)" },
};

const useStyles = makeStyles({
  root: { maxWidth: "560px" },
  hero: {
    paddingLeft: tokens.spacingHorizontalL,
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    borderLeftColor: tokens.colorPaletteGreenForeground2,
    marginBottom: tokens.spacingVerticalXL,
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationFillMode: "both",
  },
  heroTop: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalS,
  },
  checkIcon: { color: tokens.colorPaletteGreenForeground2 },
  idDisplay: {
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    display: "block",
    marginTop: tokens.spacingVerticalXS,
  },
  notifSection: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    marginBottom: tokens.spacingVerticalXL,
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationFillMode: "both",
    animationDelay: "50ms",
  },
  notifList: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    borderLeftWidth: "2px",
    borderLeftStyle: "solid",
    borderLeftColor: tokens.colorNeutralStroke2,
  },
  notifItem: {
    color: tokens.colorNeutralForeground2,
  },
  actions: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationFillMode: "both",
    animationDelay: "100ms",
  },
});

export function ReserveSuccess() {
  const styles = useStyles();
  const [params] = useSearchParams();
  const id = params.get("id");
  const ref = params.get("ref") ?? id;
  // Append context (Add-to-existing): the base being appended to and how many items.
  const base = params.get("base");
  const count = params.get("count");

  return (
    <div className={styles.root}>
      <div className={styles.hero}>
        <div className={styles.heroTop}>
          <CheckmarkCircle24Filled className={styles.checkIcon} />
          <Title2>Reservation submitted</Title2>
        </div>
        {ref && <span className={styles.idDisplay}>{ref}</span>}
        {base && (
          <Text
            size={300}
            style={{ display: "block", marginTop: tokens.spacingVerticalS, color: tokens.colorNeutralForeground2 }}
          >
            Appending {count ?? ""} item(s) to{" "}
            <span style={{ fontFamily: "monospace" }}>{base}</span> once approved.
          </Text>
        )}
        <Badge
          appearance="tint"
          color="warning"
          style={{ marginTop: tokens.spacingVerticalS, display: "inline-flex" }}
        >
          Pending approval
        </Badge>
      </div>

      <div className={styles.notifSection}>
        <Text weight="semibold" size={300}>You will be notified via</Text>
        <div className={styles.notifList}>
          <Text size={300} className={styles.notifItem}>
            Email once an approver acts on your request
          </Text>
          <Text size={300} className={styles.notifItem}>
            Microsoft Teams message with the decision
          </Text>
          <Text size={300} className={styles.notifItem}>
            In-app notification in this tool
          </Text>
        </div>
      </div>

      <div className={styles.actions}>
        <Link to="/" style={{ textDecoration: "none" }}>
          <Button appearance="primary">Return home</Button>
        </Link>
        {id && (
          <Link to={`/reservations/${id}`} style={{ textDecoration: "none" }}>
            <Button appearance="secondary">View reservation</Button>
          </Link>
        )}
        <Link to="/reserve" style={{ textDecoration: "none" }}>
          <Button appearance="subtle">Submit another</Button>
        </Link>
      </div>
    </div>
  );
}
