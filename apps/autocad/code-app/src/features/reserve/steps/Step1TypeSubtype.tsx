import { useEffect } from "react";
import { useFormContext, Controller } from "react-hook-form";
import {
  Field,
  RadioGroup,
  Radio,
  Button,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { ReserveForm } from "../schema";
import { DOCUMENT_SUBTYPE_VALUE, RESERVATION_TYPE_VALUE } from "../terminology";
import { useAppConfig } from "../../../config/useAppConfig";
import {
  isExistingSequenceAllowedForTaxonomy,
  isNewSequenceAllowedForTaxonomy,
} from "../../../config/sequenceTaxonomyConfig";

const FADE_UP = {
  from: { opacity: "0", transform: "translateY(6px)" },
  to:   { opacity: "1", transform: "translateY(0)" },
};

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    maxWidth: "720px",
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    animationName: FADE_UP,
    animationDuration: "200ms",
    animationTimingFunction: "ease-out",
    animationFillMode: "both",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalM,
  },
  primary: {
    transitionProperty: "transform, box-shadow",
    transitionDuration: tokens.durationFast,
    transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    ":hover:not(:disabled)": {
      transform: "translateY(-1px)",
    },
    ":active:not(:disabled)": {
      transform: "translateY(0) scale(0.98)",
    },
  },
});

interface Props {
  onNext: () => void;
}

export function Step1TypeSubtype({ onNext }: Props) {
  const styles = useStyles();
  const config = useAppConfig();
  const { control, watch, setValue, formState: { errors }, trigger } = useFormContext<ReserveForm>();

  const reservationType = watch("reservationType");
  const documentSubtype = watch("documentSubtype");
  const sequenceType    = watch("sequenceType");
  const isDocument = reservationType === "Document";
  const isDrawing  = reservationType === "Drawing";
  const isExisting = sequenceType === "Existing";

  const typeValue = reservationType === "Drawing"
    ? RESERVATION_TYPE_VALUE.Drawing
    : reservationType === "Document"
      ? RESERVATION_TYPE_VALUE.Document
      : undefined;
  const subtypeValue = documentSubtype ? DOCUMENT_SUBTYPE_VALUE[documentSubtype] : undefined;

  const existingAllowed = isExistingSequenceAllowedForTaxonomy(config, typeValue, subtypeValue);
  const newAllowed = isNewSequenceAllowedForTaxonomy(typeValue, subtypeValue);

  useEffect(() => {
    if (isDrawing && documentSubtype !== "DrawingDocument" && documentSubtype !== "Drawing") {
      setValue("documentSubtype", "Drawing");
    }
    if (isDocument && (documentSubtype === "DrawingDocument" || documentSubtype === "Drawing")) {
      setValue("documentSubtype", undefined);
    }
  }, [isDrawing, isDocument, documentSubtype, setValue]);

  useEffect(() => {
    if (!existingAllowed && sequenceType === "Existing") setValue("sequenceType", "New");
    if (!newAllowed && sequenceType === "New") setValue("sequenceType", "Existing");
  }, [existingAllowed, newAllowed, sequenceType, setValue]);

  const canProceed = isDrawing
    ? documentSubtype === "DrawingDocument" || documentSubtype === "Drawing"
    : !!documentSubtype;

  async function handleNext() {
    const fields: Array<keyof ReserveForm> = ["reservationType", "documentSubtype", "sequenceType"];
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
              <Radio value="Drawing"  label="Drawing" />
              <Radio value="Document" label="Document" />
            </RadioGroup>
          </Field>
        )}
      />

      {isDrawing && (
        <div key="drawing-subtype" className={styles.panel}>
          <Controller
            name="documentSubtype"
            control={control}
            render={({ field }) => (
              <Field label="Drawing Type" validationMessage={errors.documentSubtype?.message} required>
                <RadioGroup
                  value={field.value ?? ""}
                  onChange={(_, data) => field.onChange(data.value)}
                >
                  <Radio value="DrawingDocument" label="Drawing Document" />
                  <Radio value="Drawing"         label="Drawing" />
                </RadioGroup>
              </Field>
            )}
          />
        </div>
      )}

      {isDocument && (
        <div key="document-subtype" className={styles.panel}>
          <Controller
            name="documentSubtype"
            control={control}
            render={({ field }) => (
              <Field label="Document Type" validationMessage={errors.documentSubtype?.message} required>
                <RadioGroup
                  value={field.value ?? ""}
                  onChange={(_, data) => field.onChange(data.value)}
                >
                  <Radio value="Standard"  label="Standard Document" />
                  <Radio value="Procedure" label="Procedure" />
                  <Radio value="Form"      label="Form" />
                </RadioGroup>
              </Field>
            )}
          />
        </div>
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
              <Radio value="New"      label="Reserve new" disabled={!newAllowed} />
              <Radio value="Existing" label="Add to existing" disabled={!existingAllowed} />
            </RadioGroup>
          </Field>
        )}
      />

      <div className={styles.actions}>
        <Button
          appearance="primary"
          className={styles.primary}
          disabled={!canProceed}
          onClick={() => void handleNext()}
        >
          {isExisting ? "Next: Find existing" : "Next: Coding sequence"}
        </Button>
      </div>
    </div>
  );
}
