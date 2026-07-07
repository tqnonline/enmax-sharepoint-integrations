import { useEffect } from "react";
import { useFormContext, Controller } from "react-hook-form";
import {
  Field,
  RadioGroup,
  Radio,
  Button,
  Text,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { ReserveForm } from "../schema";
import { reserveTerminology } from "../terminology";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  groupHeader: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalXS,
  },
  hint: { color: tokens.colorNeutralForeground3 },
  actions: { display: "flex", gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalM },
});

interface Props {
  onNext: () => void;
}

export function Step1TypeSubtype({ onNext }: Props) {
  const styles = useStyles();
  const { control, watch, setValue, formState: { errors }, trigger } = useFormContext<ReserveForm>();

  const reservationType = watch("reservationType");
  const documentSubtype = watch("documentSubtype");
  const isDocument = reservationType === "Document";

  // Drawing has no subtype — clear any stale value when switching back.
  useEffect(() => {
    if (!isDocument && documentSubtype) setValue("documentSubtype", undefined);
  }, [isDocument, documentSubtype, setValue]);

  const term = reserveTerminology(reservationType, documentSubtype);
  const canProceed = !isDocument || !!documentSubtype;

  async function handleNext() {
    const fields: Array<keyof ReserveForm> = isDocument
      ? ["reservationType", "documentSubtype"]
      : ["reservationType"];
    if (await trigger(fields)) onNext();
  }

  return (
    <div className={styles.root}>
      <Controller
        name="reservationType"
        control={control}
        render={({ field }) => (
          <Field label="What are you reserving a number for?" validationMessage={errors.reservationType?.message} required>
            <RadioGroup
              value={field.value ?? ""}
              onChange={(_, data) => field.onChange(data.value)}
            >
              <Radio value="Drawing"  label="Drawing — a drawing with one or more Drawing Documents" />
              <Radio value="Document" label="Document — a Standard or a Procedure" />
            </RadioGroup>
          </Field>
        )}
      />

      {isDocument && (
        <Controller
          name="documentSubtype"
          control={control}
          render={({ field }) => (
            <Field label="Document type" validationMessage={errors.documentSubtype?.message} required>
              <RadioGroup
                value={field.value ?? ""}
                onChange={(_, data) => field.onChange(data.value)}
              >
                <Radio value="Standard"  label="Standard — a single document (no child forms)" />
                <Radio value="Procedure" label="Procedure — a procedure with one or more Procedure Form Documents" />
              </RadioGroup>
            </Field>
          )}
        />
      )}

      {canProceed && (
        <MessageBar intent="info">
          <MessageBarBody>
            <Text weight="semibold">{term.typeLabel}</Text>
            {term.createsChildren
              ? ` — you'll reserve one or more ${term.baseNounPlural}, each with one or more ${term.childNoun}s.`
              : ` — you'll reserve one or more ${term.baseNounPlural} (base numbers only, no child items).`}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.actions}>
        <Button appearance="primary" disabled={!canProceed} onClick={() => void handleNext()}>
          Next: Composition
        </Button>
      </div>
    </div>
  );
}
