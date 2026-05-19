import { useState, useCallback } from "react";
import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import {
  MessageBar,
  MessageBarBody,
  Spinner,
  tokens,
  makeStyles,
  Text,
} from "@fluentui/react-components";
import { reserveSchema, type ReserveForm } from "./schema";
import { Step1RecordType } from "./steps/Step1RecordType";
import { Step2Composition } from "./steps/Step2Composition";
import { Step3Details } from "./steps/Step3Details";
import { Step4Review } from "./steps/Step4Review";
import { useReferenceData } from "./hooks/useReferenceData";
import { useApprovedCombinations } from "./hooks/useApprovedCombinations";
import { useCreateReservation } from "./hooks/useCreateReservation";
import { useAppConfig } from "../../config/useAppConfig";

const useStyles = makeStyles({
  stepper: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    paddingBottom: tokens.spacingVerticalS,
  },
  step: { cursor: "default", padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}` },
  activeStep: {
    fontWeight: tokens.fontWeightSemibold,
    borderBottom: `2px solid ${tokens.colorBrandForeground1}`,
    color: tokens.colorBrandForeground1,
  },
});

const STEP_LABELS = ["Record type", "Composition", "Details", "Review"];

export function ReserveWizard() {
  const styles = useStyles();
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const config = useAppConfig();

  const methods = useForm<ReserveForm>({
    resolver: zodResolver(reserveSchema) as Resolver<ReserveForm>,
    defaultValues: {
      recordType: "Drawing",
      count: 1,
      sheetsPerDrawing: config.DefaultSheetsPerDrawing,
      sequenceType: "New",
      override: false,
    },
  });

  const refDataQuery   = useReferenceData();
  const combosQuery    = useApprovedCombinations();
  const createMutation = useCreateReservation();

  const next = useCallback(() => setStep((s) => Math.min(s + 1, 3)), []);
  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  async function handleSubmit() {
    const values = methods.getValues();
    try {
      const result = await createMutation.mutateAsync(values);
      navigate(`/reserve/success?id=${result.enmax_acdnreservationid}`);
    } catch {
      // error surfaced via createMutation.error
    }
  }

  if (refDataQuery.isPending || combosQuery.isPending) {
    return <Spinner label="Loading reference data…" />;
  }

  if (refDataQuery.isError || combosQuery.isError) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>Failed to load reference data. Please refresh the page.</MessageBarBody>
      </MessageBar>
    );
  }

  const refData = refDataQuery.data!;
  const combos  = combosQuery.data!;

  return (
    <FormProvider {...methods}>
      <div role="tablist" className={styles.stepper} aria-label="Reservation wizard steps">
        {STEP_LABELS.map((label, i) => (
          <Text
            key={label}
            role="tab"
            aria-selected={i === step}
            aria-label={`Step ${i + 1}: ${label}`}
            className={`${styles.step} ${i === step ? styles.activeStep : ""}`}
          >
            {i + 1}. {label}
          </Text>
        ))}
      </div>

      {createMutation.isError && (
        <MessageBar
          intent={(createMutation.error as { status?: number })?.status === 403 ? "error" : "error"}
          style={{ marginBottom: "1rem" }}
        >
          <MessageBarBody>
            {(createMutation.error as { status?: number })?.status === 403
              ? "Permission denied. You do not have access to create reservations."
              : `Submission failed: ${createMutation.error?.message}`}
          </MessageBarBody>
        </MessageBar>
      )}

      {step === 0 && <Step1RecordType onNext={next} />}
      {step === 1 && <Step2Composition refData={refData} combos={combos} onNext={next} />}
      {step === 2 && (
        <Step3Details
          maxCount={config.MaxDrawingsPerReservation}
          maxSheets={config.MaxSheetsPerDrawing}
          onNext={next}
          onBack={back}
        />
      )}
      {step === 3 && (
        <Step4Review
          refData={refData}
          onBack={back}
          onSubmit={() => void handleSubmit()}
          isSubmitting={createMutation.isPending}
        />
      )}
    </FormProvider>
  );
}
