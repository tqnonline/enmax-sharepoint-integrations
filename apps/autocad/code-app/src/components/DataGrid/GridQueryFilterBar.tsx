import {
  Button,
  Field,
  Input,
  Spinner,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { FilterDismissRegular, SearchRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import { PeoplePickerFilter } from "./PeoplePickerFilter";

export interface GridQueryFilterDraft {
  number: string;
  from: string;
  to: string;
}

const useStyles = makeStyles({
  filters: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    alignItems: "flex-end",
    marginBottom: tokens.spacingVerticalS,
    flexWrap: "wrap",
  },
});

interface Props {
  numberLabel: string;
  numberPlaceholder?: string;
  draft: GridQueryFilterDraft;
  onDraftChange: (patch: Partial<GridQueryFilterDraft>) => void;
  onQuery: () => void;
  onClear: () => void;
  isQuerying?: boolean;
  /** Fields between number and person (e.g. Type dropdown). */
  extraFields?: ReactNode;
  /** When set, renders a people picker between extra fields and date range. */
  personLabel?: string;
  peopleIds?: string[];
  onPeopleChange?: (ids: string[]) => void;
  personPlaceholder?: string;
  /** When false, hides From/To date inputs (e.g. reference data lookup). */
  showDateRange?: boolean;
}

export function GridQueryFilterBar({
  numberLabel,
  numberPlaceholder = "e.g. 01-AA-01-…",
  draft,
  onDraftChange,
  onQuery,
  onClear,
  isQuerying = false,
  extraFields,
  personLabel,
  peopleIds = [],
  onPeopleChange,
  personPlaceholder = "Search for a person…",
  showDateRange = true,
}: Props) {
  const styles = useStyles();

  return (
    <div className={styles.filters} role="search" aria-label="Grid filters">
      <Field label={numberLabel}>
        <Input
          value={draft.number}
          onChange={(_, d) => onDraftChange({ number: d.value })}
          placeholder={numberPlaceholder}
          contentBefore={<SearchRegular />}
          aria-label={numberLabel}
        />
      </Field>
      {extraFields}
      {personLabel && onPeopleChange && (
        <Field label={personLabel}>
          <PeoplePickerFilter
            value={peopleIds.length > 0 ? peopleIds : null}
            onChange={(val) => {
              const ids = Array.isArray(val) ? val : (val ? [val] : []);
              onPeopleChange(ids);
            }}
            ariaLabel={personLabel}
            placeholder={personPlaceholder}
          />
        </Field>
      )}
      {showDateRange && (
        <>
          <Field label="From Date">
            <input
              type="date"
              value={draft.from}
              onChange={(e) => onDraftChange({ from: e.target.value })}
              aria-label="From Date"
              style={{ padding: "5px 8px", borderRadius: "4px", border: `1px solid ${tokens.colorNeutralStroke1}` }}
            />
          </Field>
          <Field label="To Date">
            <input
              type="date"
              value={draft.to}
              onChange={(e) => onDraftChange({ to: e.target.value })}
              aria-label="To Date"
              style={{ padding: "5px 8px", borderRadius: "4px", border: `1px solid ${tokens.colorNeutralStroke1}` }}
            />
          </Field>
        </>
      )}
      <Button
        appearance="primary"
        icon={<SearchRegular />}
        disabled={isQuerying}
        onClick={onQuery}
      >
        {isQuerying && <Spinner size="tiny" style={{ marginRight: "6px" }} />}
        Query
      </Button>
      <Button
        appearance="subtle"
        icon={<FilterDismissRegular />}
        disabled={isQuerying}
        onClick={onClear}
        aria-label="Clear filters"
      >
        Clear
      </Button>
    </div>
  );
}
