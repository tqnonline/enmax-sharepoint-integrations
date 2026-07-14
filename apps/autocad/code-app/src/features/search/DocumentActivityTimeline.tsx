import { Badge, Text, tokens, makeStyles } from "@fluentui/react-components";
import { History24Regular } from "@fluentui/react-icons";
import { formatAuditSentence, lifecycleStepLabel } from "../checkout/hooks/auditSentence";
import { auditEventColor } from "../audit/auditPills";
import type { AuditEvent } from "../checkout/hooks/useDrawingAuditTrail";

const useStyles = makeStyles({
  section: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  heading: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  timeline: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  item: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    paddingLeft: tokens.spacingHorizontalS,
    borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
  },
  meta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  empty: {
    color: tokens.colorNeutralForeground3,
    fontStyle: "italic",
  },
});

interface Props {
  events: AuditEvent[];
  reservationType?: number;
  documentSubtype?: number;
  title?: string;
  compact?: boolean;
}

export function DocumentActivityTimeline({
  events,
  reservationType,
  documentSubtype,
  title = "Activity",
  compact = false,
}: Props) {
  const styles = useStyles();

  return (
    <div className={styles.section}>
      <div className={styles.heading}>
        <History24Regular aria-hidden />
        <Text weight="semibold" size={compact ? 300 : 400}>{title}</Text>
      </div>
      {events.length === 0 ? (
        <Text size={200} className={styles.empty}>
          No activity yet. Issuance, check-out, and check-in events will appear here.
        </Text>
      ) : (
        <div className={styles.timeline}>
          {events.map((ev) => (
            <div key={ev.id} className={styles.item}>
              <Badge appearance="filled" color={auditEventColor(ev.event)} size="small">
                {lifecycleStepLabel(ev)}
              </Badge>
              <Text size={200}>
                {formatAuditSentence(ev, { reservationType, documentSubtype })}
              </Text>
              {ev.reason && (
                <Text size={200} className={styles.meta}>{ev.reason}</Text>
              )}
              {ev.createdOn && (
                <Text size={100} className={styles.meta}>
                  {new Date(ev.createdOn).toLocaleString()}
                </Text>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
