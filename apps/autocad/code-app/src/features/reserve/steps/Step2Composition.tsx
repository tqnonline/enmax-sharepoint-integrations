import { useEffect, useMemo } from "react";
import { useFormContext, Controller } from "react-hook-form";
import {
  Field,
  Select,
  MessageBar,
  MessageBarBody,
  Switch,
  Textarea,
  Tooltip,
  Text,
  Button,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import type { ReserveForm } from "../schema";
import type { RefItem, ReferenceData } from "../hooks/useReferenceData";
import type { ApprovedCombinations } from "../hooks/useApprovedCombinations";
import {
  filterAssetsByBusiness,
  filterUnitsByAsset,
  filterSystemsByAssetAndDomain,
  isBusinessAssetApproved,
} from "../hooks/useApprovedCombinations";
import { SEQUENCE_TOOLTIP } from "../hooks/usePreviewNumber";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },

  // Composition chip bar (live preview at top)
  compBar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    overflowX: "auto",
    cursor: "default",
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
  segCodeEmpty: { color: tokens.colorNeutralForeground4 },
  segCodeSeq:   { color: tokens.colorPaletteYellowForeground1 },
  segSep: {
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    paddingTop: "17px",
    alignSelf: "flex-start",
  },

  // Form layout
  columns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL}`,
  },
  groupHeader: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalXS,
  },
  groupColumn: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  actions:   { display: "flex", gap: tokens.spacingHorizontalS },
});

interface Props {
  refData: ReferenceData;
  combos: ApprovedCombinations;
  onNext: () => void;
}

export function Step2Composition({ refData, combos, onNext }: Props) {
  const styles = useStyles();
  const { control, watch, setValue, formState: { errors }, trigger } = useFormContext<ReserveForm>();

  const businessId = watch("business");
  const assetId    = watch("asset");
  const unitId     = watch("unit");
  const domainId   = watch("domain");
  const systemId   = watch("system");
  const kindId     = watch("kind");
  const override   = watch("override");

  const filteredAssets = useMemo(
    () => businessId ? filterAssetsByBusiness(refData.assets, businessId, combos) : [],
    [businessId, refData.assets, combos],
  );
  const filteredUnits = useMemo(
    () => assetId ? filterUnitsByAsset(refData.units, assetId, combos) : [],
    [assetId, refData.units, combos],
  );

  const assetCode  = refData.assets.find((a) => a.id === assetId)?.code  ?? "";
  const domainCode = refData.domains.find((d) => d.id === domainId)?.code ?? "";
  const filteredSystems = (assetId && domainId)
    ? filterSystemsByAssetAndDomain(refData.systems, assetCode, domainCode, combos)
    : refData.systems;

  // Cascade clear: if selected value no longer in filtered list, clear it
  useEffect(() => {
    if (assetId && !filteredAssets.find((a) => a.id === assetId)) {
      setValue("asset", "");
      setValue("unit", "");
    }
  }, [businessId, assetId, filteredAssets, setValue]);

  useEffect(() => {
    if (unitId && !filteredUnits.find((u) => u.id === unitId)) {
      setValue("unit", "");
    }
  }, [assetId, unitId, filteredUnits, setValue]);

  useEffect(() => {
    if (systemId && !filteredSystems.find((s) => s.id === systemId)) {
      setValue("system", "");
    }
  }, [assetId, domainId, systemId, filteredSystems, setValue]);

  const businessCode = refData.businesses.find((b) => b.id === businessId)?.code ?? "";
  const unitCode     = refData.units.find((u) => u.id === unitId)?.code           ?? "";
  const systemCode   = refData.systems.find((s) => s.id === systemId)?.code       ?? "";
  const kindCode     = refData.kinds.find((k) => k.id === kindId)?.code           ?? "";

  const showOverrideWarning = !!(businessId && assetId && !isBusinessAssetApproved(businessId, assetId, combos));
  const isComplete = !!(businessId && assetId && unitId && domainId && systemId && kindId);
  const canProceed = isComplete && (!showOverrideWarning || override);

  function renderSelect(
    name: keyof ReserveForm,
    label: string,
    hint: string,
    items: RefItem[],
    disabled: boolean,
  ) {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Field
            label={label}
            hint={hint || undefined}
            validationMessage={errors[name]?.message}
            required
          >
            <Select
              {...field}
              disabled={disabled}
              aria-label={label}
              value={field.value as string}
              onChange={(_, data) => field.onChange(data.value)}
            >
              <option value="">Select…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} — {item.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      />
    );
  }

  const segments = [
    { label: "BUS",   code: businessCode, placeholder: "BB"  },
    { label: "ASSET", code: assetCode,    placeholder: "AA"  },
    { label: "UNIT",  code: unitCode,     placeholder: "UU"  },
    { label: "DOM",   code: domainCode,   placeholder: "DDD" },
    { label: "SYS",   code: systemCode,   placeholder: "SSS" },
    { label: "KIND",  code: kindCode,     placeholder: "KK"  },
  ];

  async function handleNext() {
    const ok = await trigger(["business", "asset", "unit", "domain", "system", "kind"]);
    if (ok) onNext();
  }

  return (
    <div className={styles.root}>
      {/* Live number preview at top */}
      <Tooltip content={SEQUENCE_TOOLTIP} relationship="description">
        <div className={styles.compBar} tabIndex={0} role="img" aria-label="Drawing number preview">
          {segments.map((seg, i) => (
            <span key={seg.label} style={{ display: "contents" }}>
              <div className={styles.seg}>
                <span className={styles.segLabel}>{seg.label}</span>
                <span className={mergeClasses(styles.segCode, seg.code ? styles.segCode : styles.segCodeEmpty)}>
                  {seg.code || seg.placeholder}
                </span>
              </div>
              {i < segments.length - 1 && <span className={styles.segSep}>-</span>}
            </span>
          ))}
          <span className={styles.segSep}>-</span>
          <div className={styles.seg}>
            <span className={styles.segLabel}>SEQ</span>
            <span className={mergeClasses(styles.segCode, styles.segCodeSeq)}>????</span>
          </div>
        </div>
      </Tooltip>

      {/* Two-column layout: left = site identification chain, right = technical classification chain */}
      <div className={styles.columns}>
        {/* Left: Business → Asset → Unit (cascade chain) */}
        <div className={styles.groupColumn}>
          <Text className={styles.groupHeader}>Site Identification</Text>
          {renderSelect("business", "Business", "BB segment", refData.businesses, false)}
          {renderSelect("asset",    "Asset",    !businessId ? "Select Business first" : "AA — filtered by Business", filteredAssets, !businessId)}
          {renderSelect("unit",     "Unit",     !assetId    ? "Select Asset first"    : "UU — filtered by Asset",    filteredUnits,  !assetId)}
        </div>

        {/* Right: Domain → System → Kind (System depends on Asset + Domain) */}
        <div className={styles.groupColumn}>
          <Text className={styles.groupHeader}>Technical Classification</Text>
          {renderSelect("domain", "Domain", "DDD segment", refData.domains, false)}
          {renderSelect("system", "System", !(assetId && domainId) ? "Select Asset and Domain first" : "SSS — filtered by Asset + Domain", filteredSystems, !(assetId && domainId))}
          {renderSelect("kind",   "Kind",   "KK segment",  refData.kinds,   false)}
        </div>
      </div>

      {/* Override warning */}
      {showOverrideWarning && (
        <MessageBar intent="warning">
          <MessageBarBody>
            <strong>{businessCode}–{assetCode}</strong> is not in the approved combination list.
            Enable the override toggle below and provide a justification to proceed.
          </MessageBarBody>
        </MessageBar>
      )}
      {showOverrideWarning && (
        <Controller
          name="override"
          control={control}
          render={({ field }) => (
            <Field label="Override validation">
              <Switch
                checked={field.value}
                onChange={(_, data) => field.onChange(data.checked)}
                label="Use this combination anyway (requires justification)"
              />
            </Field>
          )}
        />
      )}
      {override && (
        <Controller
          name="overrideReason"
          control={control}
          render={({ field }) => (
            <Field
              label="Override justification"
              validationMessage={errors.overrideReason?.message}
              hint="Describe why this unapproved combination is needed (min 10 chars)"
              required
            >
              <Textarea
                {...field}
                value={field.value ?? ""}
                placeholder="Explain the reason for using this unapproved combination…"
                rows={3}
              />
            </Field>
          )}
        />
      )}

      {/* Navigation */}
      <div className={styles.actions}>
        <Button
          appearance="primary"
          disabled={!canProceed}
          onClick={() => void handleNext()}
        >
          Next: Details
        </Button>
      </div>
    </div>
  );
}
