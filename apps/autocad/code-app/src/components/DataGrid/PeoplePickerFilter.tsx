import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Spinner,
  Tag,
  TagPicker,
  TagPickerControl,
  TagPickerGroup,
  TagPickerInput,
  TagPickerList,
  TagPickerOption,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { TagPickerProps } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { resolvePeopleNames, usePeopleSearch } from "./usePeopleSearch";
import type { FilterValue } from "./types";

interface Props {
  value: FilterValue;
  onChange: (val: FilterValue) => void;
  ariaLabel: string;
  /** Shown in the empty input — should name the column, e.g. "Filter by Submitted by…". */
  placeholder?: string;
}

const useStyles = makeStyles({
  root: {
    minWidth: "160px",
    maxWidth: "260px",
    width: "100%",
  },
  // Keep interactions inside the filter row from bubbling to header sort / row click.
  stop: {
    width: "100%",
  },
  clearBtn: {
    minWidth: "24px",
    maxWidth: "24px",
  },
  hint: {
    padding: tokens.spacingVerticalXS,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
});

function asIdList(value: FilterValue): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value) return [value];
  return [];
}

export function PeoplePickerFilter({
  value,
  onChange,
  ariaLabel,
  placeholder = "Filter by person…",
}: Props) {
  const styles = useStyles();
  const selectedIds = useMemo(() => asIdList(value), [value]);

  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  // Debounce search so each keystroke does not hit Dataverse.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { data: candidates = [], isFetching } = usePeopleSearch(debouncedQuery);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    void resolvePeopleNames(selectedIds).then(map => {
      if (!cancelled) setNameMap(map);
    });
    return () => { cancelled = true; };
  }, [selectedIds]);

  const mergedNames = useMemo(() => {
    const next = new Map(nameMap);
    for (const c of candidates) next.set(c.id, c.name);
    return next;
  }, [nameMap, candidates]);

  const available = candidates.filter(c => !selectedIds.includes(c.id));

  const onOptionSelect: TagPickerProps["onOptionSelect"] = (_e, data) => {
    // Tag dismiss and option pick both flow through here.
    const ids = (data.selectedOptions ?? []).filter(v => v && v !== "__none__" && v !== "__hint__");
    onChange(ids.length > 0 ? ids : null);
    setQuery("");
    setDebouncedQuery("");
    for (const c of candidates) {
      if (ids.includes(c.id)) {
        setNameMap(prev => {
          if (prev.get(c.id) === c.name) return prev;
          const copy = new Map(prev);
          copy.set(c.id, c.name);
          return copy;
        });
      }
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(null);
    setQuery("");
    setDebouncedQuery("");
  };

  const stopBubble = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const trimmed = debouncedQuery.trim();
  const showHint = trimmed.length > 0 && trimmed.length < 2 && !isFetching;
  const showEmpty = trimmed.length >= 2 && !isFetching && available.length === 0;

  return (
    <div
      className={styles.root}
      onClick={stopBubble}
      onMouseDown={stopBubble}
      onPointerDown={stopBubble}
      onKeyDown={stopBubble}
    >
      <TagPicker
        size="medium"
        selectedOptions={selectedIds}
        onOptionSelect={onOptionSelect}
        positioning="below-start"
      >
        <TagPickerControl
          className={styles.stop}
          secondaryAction={
            selectedIds.length > 0 || query ? (
              <Button
                appearance="transparent"
                size="small"
                className={styles.clearBtn}
                icon={<DismissRegular />}
                onClick={clearAll}
                onMouseDown={e => e.stopPropagation()}
                aria-label={`Clear ${ariaLabel}`}
              />
            ) : undefined
          }
        >
          <TagPickerGroup aria-label={ariaLabel}>
            {selectedIds.map(id => (
              <Tag
                key={id}
                shape="rounded"
                value={id}
                media={<Avatar aria-hidden name={mergedNames.get(id) ?? id} color="colorful" size={20} />}
              >
                {mergedNames.get(id) ?? "…"}
              </Tag>
            ))}
          </TagPickerGroup>
          <TagPickerInput
            aria-label={ariaLabel}
            placeholder={selectedIds.length ? "Add another…" : placeholder}
            value={query}
            onChange={e => setQuery(e.target.value)}
            clearable={false}
          />
        </TagPickerControl>
        <TagPickerList>
          {isFetching && trimmed.length >= 2 ? (
            <div className={styles.hint}><Spinner size="tiny" label="Searching…" /></div>
          ) : null}
          {showHint ? (
            <div className={styles.hint}>Type at least 2 characters</div>
          ) : null}
          {showEmpty ? (
            <div className={styles.hint}>No matching people</div>
          ) : null}
          {available.map(c => (
            <TagPickerOption
              key={c.id}
              value={c.id}
              text={c.name}
              media={<Avatar shape="square" aria-hidden name={c.name} color="colorful" size={24} />}
            >
              {c.name}
            </TagPickerOption>
          ))}
        </TagPickerList>
      </TagPicker>
    </div>
  );
}
