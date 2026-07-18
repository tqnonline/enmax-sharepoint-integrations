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
import { formatNumberingGroup } from "./numberingTerms";
import type { ReferenceData } from "./hooks/useReferenceData";

function codingSequenceFromForm(values: ReserveForm, refData: ReferenceData | undefined): string {
  if (!refData) return "";
  const code = (list: { id: string; code: string }[], id: string) =>
    list.find((x) => x.id === id)?.code ?? "";
  return formatNumberingGroup({
    businessCode: code(refData.businesses, values.business),
    assetCode:    code(refData.assets, values.asset),
    unitCode:     code(refData.units, values.unit),
    domainCode:   code(refData.domains, values.domain),
    systemCode:   code(refData.systems, values.system),
    kindCode:     code(refData.kinds, values.kind),
  });
}

const NEW_STEPS      = ["Type", "Coding sequence", "Details", "Review"];
const EXISTING_STEPS = ["Type", "Add to existing"];

/** Matches ReservePage / ApprovalsPage entrance motion. */
const FADE_UP = {
  from: { opacity: "0", transform: "translateY(8px)" },
  to:   { opacity: "1", transform: "translateY(0)" },
};

const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

const useStyles = makeStyles({
  stepperNav: {
    display: "flex",
    flexDirection: "column",
    marginBottom: tokens.spacingVerticalXL,
  },
  stepper: {
    display: "flex",
    alignItems: "center",
    paddingBottom: tokens.spacingVerticalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    overflowX: "auto",
  },
  stepCluster: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  },
  stepClusterGrow: {
    flex: "1",
    minWidth: 0,
  },
  stepItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalXS,
  },
  connector: {
    flex: "1",
    height: "2px",
    minWidth: "12px",
    backgroundColor: tokens.colorNeutralStroke1,
    alignSelf: "flex-start",
    marginTop: "15px",
    marginLeft: tokens.spacingHorizontalS,
    marginRight: tokens.spacingHorizontalS,
    transitionProperty: "background-color, transform",
    transitionDuration: tokens.durationNormal,
    transitionTimingFunction: "ease-out",
    transformOrigin: "left center",
  },
  connectorComplete: {
    backgroundColor: tokens.colorBrandBackground,
    transform: "scaleX(1)",
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
    transitionProperty: "transform, border-color, background-color, color, box-shadow",
    transitionDuration: tokens.durationNormal,
    transitionTimingFunction: SPRING,
  },
  circleActive: {
    border: `2px solid ${tokens.colorBrandBackground}`,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    transform: "scale(1.08)",
    boxShadow: `0 0 0 4px ${tokens.colorBrandBackground2}`,
  },
  circleComplete: {
    border: `2px solid ${tokens.colorBrandBackground}`,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    transform: "scale(1)",
  },
  stepLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    textAlign: "center",
    whiteSpace: "nowrap",
    transitionProperty: "color, font-weight",
    transitionDuration: tokens.durationFast,
  },
  stepLabelActive: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  stepLabelComplete: {
    color: tokens.colorNeutralForeground2,
  },
  stepCount: {
    color: tokens.colorNeutralForeground3,
    alignSelf: "flex-end",
    marginTop: tokens.spacingVerticalXS,
  },
  content: {
    paddingTop: tokens.spacingVerticalS,
    animationName: FADE_UP,
    animationDuration: "220ms",
    animationTimingFunction: "ease-out",
    animationFillMode: "both",
  },
  errorBar: {
    marginBottom: tokens.spacingVerticalM,
    animationName: FADE_UP,
    animationDuration: "180ms",
    animationFillMode: "both",
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
      documentSubtype: "Drawing",
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
      const coding = codingSequenceFromForm(values, refDataQuery.data);
      const ref = coding || result.number;
      navigate(`/reserve/success?id=${result.id}&ref=${encodeURIComponent(ref)}`);
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
  const userStep = step;

  return (
    <FormProvider {...methods}>
      <nav aria-label="Reservation wizard steps" className={styles.stepperNav}>
        <div className={styles.stepper}>
          {steps.map((label, i) => {
            const isComplete = i < userStep;
            const isActive   = i === userStep;
            const isLast     = i === steps.length - 1;

            return (
              <div
                key={label}
                className={mergeClasses(styles.stepCluster, !isLast && styles.stepClusterGrow)}
              >
                <div className={styles.stepItem}>
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

                {!isLast && (
                  <div
                    className={mergeClasses(
                      styles.connector,
                      isComplete && styles.connectorComplete,
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
        <Text size={100} className={styles.stepCount}>
          Step {userStep + 1} of {steps.length}
        </Text>
      </nav>

      {createMutation.isError && (
        <MessageBar intent="error" className={styles.errorBar}>
          <MessageBarBody>
            {(createMutation.error as { status?: number })?.status === 403
              ? "Permission denied. You do not have access to create reservations."
              : `Submission failed: ${(createMutation.error as Error)?.message ?? "Unknown error"}`}
          </MessageBarBody>
        </MessageBar>
      )}

      {/* key remounts the pane so FADE_UP replays on every step change */}
      <div key={`${isExisting ? "e" : "n"}-${step}`} className={styles.content}>
        {step === 0 && <Step1TypeSubtype onNext={next} />}
        {isExisting ? (
          step === 1 && <StepAddToExisting onBack={back} />
        ) : (
          <>
            {step === 1 && <Step2Composition refData={refData} onNext={next} onBack={back} />}
            {step === 2 && (
              <Step3Details
                maxCount={config.MaxRecordsPerReservation}
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
