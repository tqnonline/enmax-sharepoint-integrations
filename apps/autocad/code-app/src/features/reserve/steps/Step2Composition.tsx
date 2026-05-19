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
  makeStyles,
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
import { buildPreviewNumber, SEQUENCE_TOOLTIP } from "../hooks/usePreviewNumber";

const useStyles = makeStyles({
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: tokens.spacingHorizontalM,
  },
  preview: {
    marginTop: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  previewNumber: {
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
  },
  seqPlaceholder: {
    color: tokens.colorPaletteYellowForeground1,
  },
});

interface Props {
  refData: ReferenceData;
  combos: ApprovedCombinations;
  onNext: () => void;
}

export function Step2Composition({ refData, combos, onNext }: Props) {
  const styles = useStyles();
  const { control, watch, setValue, formState: { errors } } = useFormContext<ReserveForm>();

  const businessId = watch("business");
  const assetId    = watch("asset");
  const unitId     = watch("unit");
  const domainId   = watch("domain");
  const systemId   = watch("system");
  const kindId     = watch("kind");
  const override   = watch("override");

  const filteredAssets  = useMemo(
    () => businessId ? filterAssetsByBusiness(refData.assets, businessId, combos) : [],
    [businessId, refData.assets, combos],
  );
  const filteredUnits   = useMemo(
    () => assetId ? filterUnitsByAsset(refData.units, assetId, combos) : [],
    [assetId, refData.units, combos],
  );

  const assetCode    = refData.assets.find((a) => a.id === assetId)?.code   ?? "";
  const domainCode   = refData.domains.find((d) => d.id === domainId)?.code ?? "";
  const filteredSystems = (assetId && domainId)
    ? filterSystemsByAssetAndDomain(refData.systems, assetCode, domainCode, combos)
    : refData.systems;

  const showOverrideWarning = !!(businessId && assetId && !isBusinessAssetApproved(businessId, assetId, combos));

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

  const preview = buildPreviewNumber({ businessCode, assetCode, unitCode, domainCode, systemCode, kindCode });
  const isComplete = !!(businessId && assetId && unitId && domainId && systemId && kindId);

  function renderSelect(
    name: keyof ReserveForm,
    label: string,
    items: RefItem[],
    disabled: boolean,
  ) {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Field label={label} validationMessage={errors[name]?.message} required>
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

  return (
    <div>
      <div className={styles.grid}>
        {renderSelect("business", "Business", refData.businesses, false)}
        {renderSelect("asset",    "Asset",    filteredAssets,      !businessId)}
        {renderSelect("unit",     "Unit",     filteredUnits,       !assetId)}
        {renderSelect("domain",   "Domain",   refData.domains,     false)}
        {renderSelect("system",   "System",   filteredSystems,     !(assetId && domainId))}
        {renderSelect("kind",     "Kind",     refData.kinds,       false)}
      </div>

      {showOverrideWarning && (
        <MessageBar intent="warning">
          <MessageBarBody>
            The combination {businessCode}–{assetCode} is not in the approved list.
          </MessageBarBody>
        </MessageBar>
      )}

      {showOverrideWarning && (
        <Controller
          name="override"
          control={control}
          render={({ field }) => (
            <Field label="Use anyway with justification">
              <Switch
                checked={field.value}
                onChange={(_, data) => field.onChange(data.checked)}
                label="Override validation"
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
              required
            >
              <Textarea
                {...field}
                value={field.value ?? ""}
                placeholder="Provide a justification for your supervisor (min 10 chars)"
                rows={3}
              />
            </Field>
          )}
        />
      )}

      <div className={styles.preview}>
        <Text>Live preview: </Text>
        <Tooltip content={SEQUENCE_TOOLTIP} relationship="description">
          <span className={styles.previewNumber}>
            {preview.replace("????", "")}
            <span className={styles.seqPlaceholder}>????</span>
          </span>
        </Tooltip>
      </div>

      {isComplete && !showOverrideWarning && (
        <button type="button" onClick={onNext} style={{ marginTop: "1rem" }}>
          Next
        </button>
      )}
      {isComplete && showOverrideWarning && override && (
        <button type="button" onClick={onNext} style={{ marginTop: "1rem" }}>
          Next
        </button>
      )}
    </div>
  );
}
