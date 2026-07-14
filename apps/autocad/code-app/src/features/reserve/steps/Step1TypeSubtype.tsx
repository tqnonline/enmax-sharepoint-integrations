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

  return (
    <div className={styles.root}>
      <Controller
        name="reservationType"
        control={control}
        render={({ field }) => (
          <Field label="What Are You Reserving A Number For?" validationMessage={errors.reservationType?.message} required>
            <RadioGroup
              value={field.value ?? ""}
              onChange={(_, data) => field.onChange(data.value)}
            >
              <Radio value="Drawing"  label="Drawing — Reserves A Drawing Number With One Or More Drawing Documents (-SSS)" />
              <Radio value="Document" label="Document — Standard, Procedure, or Form" />
            </RadioGroup>
          </Field>
        )}
      />

      {isDocument && (
        <Controller
          name="documentSubtype"
          control={control}
          render={({ field }) => (
            <Field label="Document Type" validationMessage={errors.documentSubtype?.message} required>
              <RadioGroup
                value={field.value ?? ""}
                onChange={(_, data) => field.onChange(data.value)}
              >
                <Radio value="Standard"  label="Standard Document — Single Issued Number (BB-AA-UU-DDD-SSS-KK-NNNN)" />
                <Radio value="Procedure" label="Procedure — Single Issued Number (BB-AA-UU-DDD-SSS-KK-NNNN)" />
                <Radio value="Form"      label="Form — Form Number With One Or More Forms (-SSS)" />
              </RadioGroup>
            </Field>
          )}
        />
      )}

      <Controller
        name="sequenceType"
        control={control}
        render={({ field }) => (
          <Field label="New Or Existing?" required>
            <RadioGroup
              value={field.value ?? "New"}
              onChange={(_, data) => field.onChange(data.value)}
            >
              <Radio value="New"      label="Reserve new" />
              <Radio value="Existing" label="Add to existing coding" />
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
                ? ` — you'll search for an existing coding and append the next ${term.childNoun}s to it.`
                : ` — you'll search for an existing coding and issue the next ${term.baseNoun} number(s) in it.`
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
