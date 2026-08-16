import { Suspense } from "react";
import { Spinner, Title2, Text, tokens, makeStyles } from "@fluentui/react-components";
import { ReserveWizard } from "./ReserveWizard";

const FADE_UP = {
  from: { opacity: "0", transform: "translateY(8px)" },
  to:   { opacity: "1", transform: "translateY(0)" },
};

const useStyles = makeStyles({
  page: {},
  header: {
    paddingLeft: tokens.spacingHorizontalL,
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    borderLeftColor: tokens.colorBrandForeground1,
    marginBottom: tokens.spacingVerticalXL,
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationFillMode: "both",
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
    display: "block",
  },
});

export function ReservePage() {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Title2 as="h1">Reserve Drawing Numbers &amp; Documents</Title2>
        <Text size={300} className={styles.subtitle}>
          Create an official Drawing/Document Reservation. Pending approver review.
        </Text>
      </div>
      <Suspense fallback={<Spinner label="Loading…" />}>
        <ReserveWizard />
      </Suspense>
    </div>
  );
}
