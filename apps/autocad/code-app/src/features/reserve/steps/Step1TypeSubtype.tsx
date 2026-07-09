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
  const sequenceType    = watch("sequenceType");
  const isDocument = reservationType === "Document";
  const isExisting = sequenceType === "Existing";

  // Drawing has no subtype — clear any stale value when switching back.
  useEffect(() => {
    if (!isDocument && documentSubtype) setValue("documentSubtype", undefined);
  }, [isDocument, documentSubtype, setValue]);

  const term = reserveTerminology(reservationType, documentSubtype);
  const canProceed = !isDocument || !!documentSubtype;

  async function handleNext() {
    const fields: Array<keyof ReserveForm> = isDocument
      ? ["reservationType", "documentSubtype", "sequenceType"]
      : ["reservationType", "sequenceType"];
    if (await trigger(fields)) onNext();
  }

  const existingNoun = isDocument && documentSubtype === "Standard"
    ? "coding"
    : `${term.baseNoun} number`;

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
              <Radio value="Drawing"  label="Drawing — reserves a Drawing Number with one or more Drawing documents (-SSS)" />
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
                <Radio value="Standard"  label="Standard Document — single issued number (BB-AA-UU-DDD-SSS-KK-NNNN)" />
                <Radio value="Procedure" label="Procedure — Procedure Number range with one or more Procedure forms (-SSS)" />
              </RadioGroup>
            </Field>
          )}
        />
      )}

      <Controller
        name="sequenceType"
        control={control}
        render={({ field }) => (
          <Field label="New or existing?" required>
            <RadioGroup
              value={field.value ?? "New"}
              onChange={(_, data) => field.onChange(data.value)}
            >
              <Radio value="New"      label={`Reserve new ${term.baseNounPlural}`} />
              <Radio value="Existing" label={term.createsChildren
                ? `Add to an existing ${term.baseNoun} number`
                : `Add another standard document to an existing coding`} />
            </RadioGroup>
          </Field>
        )}
      />

      {canProceed && (
        <MessageBar intent="info">
          <MessageBarBody>
            <Text weight="semibold">{term.typeLabel}</Text>
            {isExisting
              ? term.createsChildren
                ? ` — you'll search for an existing ${existingNoun} and append the next ${term.childNoun}s to it.`
                : ` — you'll search for an existing ${existingNoun} and issue the next standard document number(s) in it.`
              : term.createsChildren
                ? ` — you'll reserve one or more ${term.baseNounPlural}, each with one or more ${term.childNoun}s.`
                : ` — you'll reserve one or more ${term.baseNounPlural} (base numbers only, no child items).`}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.actions}>
        <Button appearance="primary" disabled={!canProceed} onClick={() => void handleNext()}>
          {isExisting ? "Next: Find existing" : "Next: Composition"}
        </Button>
      </div>
    </div>
  );
}
