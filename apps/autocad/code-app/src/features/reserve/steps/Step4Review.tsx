import { useFormContext } from "react-hook-form";
import {
  Text,
  MessageBar,
  MessageBarBody,
  Tooltip,
  Spinner,
  Button,
  tokens,
  makeStyles,
  mergeClasses,
} from "@fluentui/react-components";
import type { ReserveForm } from "../schema";
import type { ReferenceData } from "../hooks/useReferenceData";
import { SEQUENCE_TOOLTIP } from "../hooks/usePreviewNumber";

const FADE_UP = {
  from: { opacity: "0", transform: "translateY(8px)" },
  to:   { opacity: "1", transform: "translateY(0)" },
};

const useStyles = makeStyles({
  compBar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    marginBottom: tokens.spacingVerticalL,
    overflowX: "auto",
    cursor: "default",
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationFillMode: "both",
  },
  seg: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
  },
  segLabel: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    lineHeight: "1",
    marginBottom: "3px",
  },
  segCode: {
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  segCodeSeq: { color: tokens.colorPaletteYellowForeground1 },
  segSep: {
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    paddingTop: "17px",
    alignSelf: "flex-start",
  },
  details: {
    display: "grid",
    gridTemplateColumns: "130px 1fr",
    gap: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    marginBottom: tokens.spacingVerticalL,
    alignItems: "start",
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationFillMode: "both",
    animationDelay: "50ms",
  },
  label: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    paddingTop: "2px",
  },
  overrideWarn: {
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationFillMode: "both",
    animationDelay: "100ms",
    marginBottom: tokens.spacingVerticalM,
  },
  actions: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationFillMode: "both",
    animationDelay: "150ms",
  },
});

interface Props {
  refData: ReferenceData;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

interface SegProps { label: string; code: string; seq?: boolean; }

function Seg({ label, code, seq }: SegProps) {
  const styles = useStyles();
  return (
    <div className={styles.seg}>
      <span className={styles.segLabel}>{label}</span>
      <span className={mergeClasses(styles.segCode, seq ? styles.segCodeSeq : undefined)}>
        {code}
      </span>
    </div>
  );
}

export function Step4Review({ refData, onBack, onSubmit, isSubmitting }: Props) {
  const styles = useStyles();
  const { watch } = useFormContext<ReserveForm>();
  const form = watch();

  const business = refData.businesses.find((b) => b.id === form.business);
  const asset    = refData.assets.find((a) => a.id === form.asset);
  const unit     = refData.units.find((u) => u.id === form.unit);
  const domain   = refData.domains.find((d) => d.id === form.domain);
  const system   = refData.systems.find((s) => s.id === form.system);
  const kind     = refData.kinds.find((k) => k.id === form.kind);

  const segments: SegProps[] = [
    { label: "BUS",   code: business?.code ?? "??"  },
    { label: "ASSET", code: asset?.code    ?? "??"  },
    { label: "UNIT",  code: unit?.code     ?? "??"  },
    { label: "DOM",   code: domain?.code   ?? "???" },
    { label: "SYS",   code: system?.code   ?? "???" },
    { label: "KIND",  code: kind?.code     ?? "??"  },
  ];

  return (
    <div>
      {/* Composition chip bar */}
      <Tooltip content={SEQUENCE_TOOLTIP} relationship="description">
        <div className={styles.compBar} tabIndex={0} role="img" aria-label="Drawing number preview">
          {segments.map((seg, i) => (
            <span key={seg.label} style={{ display: "contents" }}>
              <Seg {...seg} />
              {i < segments.length - 1 && <span className={styles.segSep}>-</span>}
            </span>
          ))}
          <span className={styles.segSep}>-</span>
          <Seg label="SEQ" code="????" seq />
        </div>
      </Tooltip>

      {/* Detail grid */}
      <div className={styles.details}>
        <span className={styles.label}>Business</span>
        <span>{business?.code} — {business?.name}</span>

        <span className={styles.label}>Asset</span>
        <span>{asset?.code} — {asset?.name}</span>

        <span className={styles.label}>Unit</span>
        <span>{unit?.code} — {unit?.name}</span>

        <span className={styles.label}>Domain</span>
        <span>{domain?.code} — {domain?.name}</span>

        <span className={styles.label}>System</span>
        <span>{system?.code} — {system?.name}</span>

        <span className={styles.label}>Kind</span>
        <span>{kind?.code} — {kind?.name}</span>

        <span className={styles.label}>Drawings</span>
        <span>{form.count}</span>

        <span className={styles.label}>Sheets / drawing</span>
        <span>{form.sheetsPerDrawing}</span>

        <span className={styles.label}>Sequence type</span>
        <span>{form.sequenceType}</span>

        <span className={styles.label}>Reason</span>
        <span>{form.reason}</span>
      </div>

      {form.override && (
        <div className={styles.overrideWarn}>
          <MessageBar intent="warning">
            <MessageBarBody>
              <Text weight="semibold">Validation override active</Text>
              <br />
              {business?.code}–{asset?.code} is not in the approved list.
              Justification: {form.overrideReason}
            </MessageBarBody>
          </MessageBar>
        </div>
      )}

      <div className={styles.actions}>
        <Button appearance="secondary" onClick={onBack} disabled={isSubmitting}>Back</Button>
        <Button
          appearance="primary"
          onClick={onSubmit}
          disabled={isSubmitting}
          icon={isSubmitting ? <Spinner size="tiny" /> : undefined}
        >
          {isSubmitting ? "Submitting…" : "Submit reservation"}
        </Button>
      </div>
    </div>
  );
}
