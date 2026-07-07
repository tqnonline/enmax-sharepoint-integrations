import { useState } from "react";
import { useForm, FormProvider, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import {
  MessageBar,
  MessageBarBody,
  Spinner,
  tokens,
  makeStyles,
  mergeClasses,
  Text,
} from "@fluentui/react-components";
import { CheckmarkCircle20Filled, Circle20Regular } from "@fluentui/react-icons";
import { reserveSchema, type ReserveForm } from "./schema";
import { Step1TypeSubtype } from "./steps/Step1TypeSubtype";
import { Step2Composition } from "./steps/Step2Composition";
import { Step3Details } from "./steps/Step3Details";
import { Step4Review } from "./steps/Step4Review";
import { StepAddToExisting } from "./steps/StepAddToExisting";
import { useReferenceData } from "./hooks/useReferenceData";
import { useCreateReservation } from "./hooks/useCreateReservation";
import { useAppConfig } from "../../config/useAppConfig";

const NEW_STEPS      = ["Type", "Composition", "Details", "Review"];
const EXISTING_STEPS = ["Type", "Add to existing"];

const useStyles = makeStyles({
  stepper: {
    display: "flex",
    alignItems: "center",
    gap: "0",
    marginBottom: tokens.spacingVerticalXL,
    paddingBottom: tokens.spacingVerticalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  stepItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalXS,
    position: "relative",
    flex: "1",
  },
  connector: {
    flex: "1",
    height: "2px",
    backgroundColor: tokens.colorNeutralStroke1,
    marginBottom: tokens.spacingVerticalL,
    alignSelf: "center",
    maxWidth: "80px",
  },
  connectorComplete: {
    backgroundColor: tokens.colorBrandBackground,
  },
  circle: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `2px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    userSelect: "none",
  },
  circleActive: {
    border: `2px solid ${tokens.colorBrandBackground}`,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  circleComplete: {
    border: `2px solid ${tokens.colorBrandBackground}`,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  stepLabelActive: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  stepLabelComplete: {
    color: tokens.colorNeutralForeground2,
  },
  content: {
    paddingTop: tokens.spacingVerticalS,
  },
});

export function ReserveWizard() {
  const styles = useStyles();
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const config = useAppConfig();

  const methods = useForm<ReserveForm>({
    resolver: zodResolver(reserveSchema) as Resolver<ReserveForm>,
    defaultValues: {
      reservationType: "Drawing",
      count: 1,
      sheetsPerDrawing: config.DefaultSheetsPerDrawing,
      sequenceType: "New",
    },
  });

  const refDataQuery   = useReferenceData();
  const createMutation = useCreateReservation();

  const sequenceType = useWatch({ control: methods.control, name: "sequenceType" });
  const isExisting = sequenceType === "Existing";
  const steps      = isExisting ? EXISTING_STEPS : NEW_STEPS;
  const maxStep    = steps.length - 1;

  const next = () => setStep((s) => Math.min(s + 1, maxStep));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  async function handleSubmit() {
    const values = methods.getValues();
    try {
      const result = await createMutation.mutateAsync(values);
      navigate(`/reserve/success?id=${result.enmax_acdnreservationid}`);
    } catch {
      // error surfaced via createMutation.error below
    }
  }

  if (refDataQuery.isPending) {
    return <Spinner label="Loading reference data…" />;
  }

  if (refDataQuery.isError) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>Failed to load reference data. Please refresh the page.</MessageBarBody>
      </MessageBar>
    );
  }

  const refData = refDataQuery.data!;

  // Every wizard step is now interactive (Type is the first), so the stepper index
  // maps 1:1 to the form step.
  const userStep = step;

  return (
    <FormProvider {...methods}>
      {/* Stepper */}
      <nav aria-label="Reservation wizard steps" style={{ display: "flex", flexDirection: "column", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", paddingBottom: "1rem", borderBottom: `1px solid ${tokens.colorNeutralStroke1}` }}>
        {steps.map((label, i) => {
          const isComplete = i < userStep;
          const isActive   = i === userStep;

          return (
            <div key={label} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? "1" : "0" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <div
                  className={mergeClasses(
                    styles.circle,
                    isActive   && styles.circleActive,
                    isComplete && styles.circleComplete,
                  )}
                  aria-current={isActive ? "step" : undefined}
                >
                  {isComplete
                    ? <CheckmarkCircle20Filled style={{ fontSize: "18px" }} />
                    : isActive
                      ? <span>{i + 1}</span>
                      : <Circle20Regular style={{ fontSize: "18px", opacity: 0.4 }} />
                  }
                </div>
                <Text
                  size={100}
                  className={mergeClasses(
                    styles.stepLabel,
                    isActive   && styles.stepLabelActive,
                    isComplete && styles.stepLabelComplete,
                  )}
                >
                  {label}
                </Text>
              </div>

              {i < steps.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: "2px",
                    backgroundColor: isComplete ? tokens.colorBrandBackground : tokens.colorNeutralStroke1,
                    alignSelf: "flex-start",
                    marginTop: "15px",
                    marginLeft: "8px",
                    marginRight: "8px",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <Text
        size={100}
        style={{
          color: tokens.colorNeutralForeground3,
          alignSelf: "flex-end",
          marginTop: tokens.spacingVerticalXS,
        }}
      >
        Step {userStep + 1} of {steps.length}
      </Text>
      </nav>

      {/* Submission error */}
      {createMutation.isError && (
        <MessageBar intent="error" style={{ marginBottom: "1rem" }}>
          <MessageBarBody>
            {(createMutation.error as { status?: number })?.status === 403
              ? "Permission denied. You do not have access to create reservations."
              : `Submission failed: ${(createMutation.error as Error)?.message ?? "Unknown error"}`}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.content}>
        {step === 0 && <Step1TypeSubtype onNext={next} />}
        {isExisting ? (
          step === 1 && <StepAddToExisting onBack={back} />
        ) : (
          <>
            {step === 1 && <Step2Composition refData={refData} onNext={next} onBack={back} />}
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
          </>
        )}
      </div>
    </FormProvider>
  );
}
