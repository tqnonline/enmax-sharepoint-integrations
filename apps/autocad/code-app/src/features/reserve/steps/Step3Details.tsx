import { useFormContext, Controller } from "react-hook-form";
import {
  Field,
  Input,
  Textarea,
  Button,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import type { ReserveForm } from "../schema";
import { reserveTerminology } from "../terminology";

const useStyles = makeStyles({
  row: { display: "flex", gap: tokens.spacingHorizontalM },
  half: { flex: 1 },
});

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Props {
  maxCount: number;
  maxSheets: number;
  onNext: () => void;
  onBack: () => void;
}

export function Step3Details({ maxCount, maxSheets, onNext, onBack }: Props) {
  const styles = useStyles();
  const { control, watch, formState: { errors }, trigger } = useFormContext<ReserveForm>();

  const term = reserveTerminology(watch("reservationType"), watch("documentSubtype"));

  async function handleNext() {
    const fields: Array<keyof ReserveForm> = term.createsChildren
      ? ["count", "sheetsPerDrawing", "reason"]
      : ["count", "reason"];
    const ok = await trigger(fields);
    if (ok) onNext();
  }

  return (
    <div>
      <div className={styles.row}>
        <div className={styles.half}>
          <Controller
            name="count"
            control={control}
            render={({ field }) => (
              <Field
                label={`Number of ${term.baseNounPlural} (1–${maxCount})`}
                validationMessage={errors.count?.message}
                required
              >
                <Input
                  type="number"
                  min={1}
                  max={maxCount}
                  {...field}
                  value={String(field.value ?? "")}
                  onChange={(_, data) => field.onChange(data.value)}
                />
              </Field>
            )}
          />
        </div>
        {/* Standard documents are base-only (ADR 0001 #1) — no child-count field. */}
        {term.createsChildren && (
          <div className={styles.half}>
            <Controller
              name="sheetsPerDrawing"
              control={control}
              render={({ field }) => (
                <Field
                  label={`${capitalize(term.childNoun!)}s per ${term.baseNoun} (1–${maxSheets})`}
                  validationMessage={errors.sheetsPerDrawing?.message}
                  required
                >
                  <Input
                    type="number"
                    min={1}
                    max={maxSheets}
                    {...field}
                    value={String(field.value ?? "")}
                    onChange={(_, data) => field.onChange(data.value)}
                  />
                </Field>
              )}
            />
          </div>
        )}
      </div>

      <Controller
        name="reason"
        control={control}
        render={({ field }) => (
          <Field
            label="Reason for reservation"
            validationMessage={errors.reason?.message}
            required
          >
            <Textarea
              {...field}
              placeholder={`Describe the purpose of these ${term.baseNoun} numbers (min 10 chars)`}
              rows={4}
            />
          </Field>
        )}
      />

      <div style={{ marginTop: "1.5rem", display: "flex", gap: tokens.spacingHorizontalS }}>
        <Button appearance="secondary" onClick={onBack}>Back</Button>
        <Button appearance="primary" onClick={() => void handleNext()}>Next: Review</Button>
      </div>
    </div>
  );
}
