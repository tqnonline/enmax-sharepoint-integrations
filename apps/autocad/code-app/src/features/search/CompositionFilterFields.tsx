import { Field, Select, Text, tokens, makeStyles } from "@fluentui/react-components";
import type { ReferenceData } from "../reserve/hooks/useReferenceData";
import { NUMBERING_GROUP_LABEL, NUMBERING_GROUP_PATTERN } from "../reserve/numberingTerms";
import type { CompositionFilterIds } from "./searchListFilters";

const useStyles = makeStyles({
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalM,
    alignItems: "flex-end",
    marginBottom: tokens.spacingVerticalS,
  },
  field: { minWidth: "140px", flex: "1 1 140px", maxWidth: "200px" },
});

interface Props {
  refData: ReferenceData | undefined;
  value: CompositionFilterIds;
  onChange: (patch: Partial<CompositionFilterIds>) => void;
}

function refSelect(
  label: string,
  items: { id: string; code: string; name: string }[],
  selectedId: string,
  onSelect: (id: string) => void,
  className: string,
) {
  return (
    <Field label={label} className={className}>
      <Select
        value={selectedId}
        onChange={(_, d) => onSelect(d.value)}
        aria-label={`Filter by ${label}`}
      >
        <option value="">All</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.code} — {item.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function CompositionFilterFields({ refData, value, onChange }: Props) {
  const styles = useStyles();
  const data = refData ?? {
    businesses: [], assets: [], units: [], domains: [], systems: [], kinds: [],
  };

  return (
    <div>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalXS }}>
        {NUMBERING_GROUP_LABEL} ({NUMBERING_GROUP_PATTERN})
      </Text>
      <div className={styles.row} role="group" aria-label={NUMBERING_GROUP_LABEL}>
      {refSelect("Business", data.businesses, value.businessId, (id) => onChange({ businessId: id }), styles.field)}
      {refSelect("Asset", data.assets, value.assetId, (id) => onChange({ assetId: id }), styles.field)}
      {refSelect("Unit", data.units, value.unitId, (id) => onChange({ unitId: id }), styles.field)}
      {refSelect("Domain", data.domains, value.domainId, (id) => onChange({ domainId: id }), styles.field)}
      {refSelect("System", data.systems, value.systemId, (id) => onChange({ systemId: id }), styles.field)}
      {refSelect("Kind", data.kinds, value.kindId, (id) => onChange({ kindId: id }), styles.field)}
      </div>
    </div>
  );
}
