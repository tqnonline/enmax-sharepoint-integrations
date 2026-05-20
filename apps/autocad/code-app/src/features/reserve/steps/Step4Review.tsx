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
} from "@fluentui/react-components";
import type { ReserveForm } from "../schema";
import type { ReferenceData } from "../hooks/useReferenceData";
import { SEQUENCE_TOOLTIP } from "../hooks/usePreviewNumber";

const useStyles = makeStyles({
  table: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    marginBottom: tokens.spacingVerticalL,
  },
  label: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2 },
  preview: {
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  seqPlaceholder: { color: tokens.colorPaletteYellowForeground1 },
  actions: { display: "flex", gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalL },
});

interface Props {
  refData: ReferenceData;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
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

  return (
    <div>
      <div className={styles.table}>
        <span className={styles.label}>Record type</span>
        <span>Drawing</span>

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

        <span className={styles.label}>Number preview</span>
        <Tooltip content={SEQUENCE_TOOLTIP} relationship="description">
          <span className={styles.preview} style={{ fontFamily: "monospace" }}>
            {[
              business?.code,
              asset?.code,
              unit?.code,
              domain?.code,
              system?.code,
              kind?.code,
            ].join("-")}
            {"-"}
            <span className={styles.seqPlaceholder}>????</span>
          </span>
        </Tooltip>
      </div>

      {form.override && (
        <MessageBar intent="warning">
          <MessageBarBody>
            <Text weight="semibold">⚠ Validation override</Text>
            <br />
            The combination {business?.code}–{asset?.code} is not in the approved list.
            Justification: {form.overrideReason}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.actions}>
        <Button appearance="secondary" onClick={onBack} disabled={isSubmitting}>Back</Button>
        <Button appearance="primary" onClick={onSubmit} disabled={isSubmitting} icon={isSubmitting ? <Spinner size="tiny" /> : undefined}>
          {isSubmitting ? "Submitting…" : "Submit reservation"}
        </Button>
      </div>
    </div>
  );
}
