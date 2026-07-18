import { useEffect, useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import {
  Field,
  Input,
  Button,
  Spinner,
  Text,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Search20Regular } from "@fluentui/react-icons";
import type { ReserveForm } from "../schema";
import { reserveTerminology } from "../terminology";
import { useSearchExistingBases, type ExistingBase } from "../hooks/useSearchExistingBases";
import { useCreateReservation } from "../hooks/useCreateReservation";
import { useAppConfig } from "../../../config/useAppConfig";
import { ExistingBaseGrid } from "./ExistingBaseGrid";

const MAX_CHILD_ITEMS = 999;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  title: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200 },
  empty: { color: tokens.colorNeutralForeground3, padding: tokens.spacingVerticalM },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  countInput: { maxWidth: "160px" },
  actions: { display: "flex", gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalM },
});

interface Props {
  onBack: () => void;
}

export function StepAddToExisting({ onBack }: Props) {
  const styles = useStyles();
  const navigate = useNavigate();
  const config = useAppConfig();
  const { watch } = useFormContext<ReserveForm>();

  const term = reserveTerminology(watch("reservationType"), watch("documentSubtype"));
  const reservationType = watch("reservationType");
  const documentSubtype = watch("documentSubtype");

  const [rawQuery, setRawQuery]   = useState("");
  const [query, setQuery]         = useState("");
  const [selected, setSelected]   = useState<ExistingBase | null>(null);
  const [count, setCount]         = useState(1);

  // Debounce the search so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery), 300);
    return () => clearTimeout(t);
  }, [rawQuery]);

  const search     = useSearchExistingBases(query, reservationType, documentSubtype);
  const createNext = useCreateReservation();

  // Children (Drawing/Procedure) are capped at 999 total; Standard uses the config max.
  const maxCount = term.createsChildren
    ? Math.max(MAX_CHILD_ITEMS - (selected?.childCount ?? 0), 0)
    : config.MaxRecordsPerReservation;

  const clampedCount = useMemo(
    () => Math.min(Math.max(count, 1), Math.max(maxCount, 1)),
    [count, maxCount],
  );

  const submitting = createNext.isPending;
  const submitError = createNext.error as Error | null;

  function selectBase(base: ExistingBase) {
    setSelected(base);
    setCount(1);
    createNext.reset();
  }

  async function handleSubmit() {
    if (!selected || maxCount < 1) return;

    if (term.createsChildren) {
      // Appending children (Drawing/Procedure) now goes through reservation approval
      // instead of calling AddChildItems directly. The target base GUID is bound on
      // the reservation; issuance happens when an approver acts (ADR 0001 #2/#6).
      const form: ReserveForm & { targetDrawingId: string } = {
        reservationType: watch("reservationType"),
        documentSubtype: watch("documentSubtype"),
        business: selected.business,
        asset:    selected.asset,
        unit:     selected.unit,
        domain:   selected.domain,
        system:   selected.system,
        kind:     selected.kind,
        count:    clampedCount,
        sheetsPerDrawing: 1,
        sequenceType: "Existing",
        reason: `Add ${clampedCount} ${term.childNoun} item(s) to existing ${selected.number}`,
        targetDrawingId: selected.id,
      };
      const created = await createNext.mutateAsync(form);
      navigate(
        `/reserve/success?id=${created.id}&ref=${encodeURIComponent(created.number)}` +
        `&base=${encodeURIComponent(selected.number)}&count=${clampedCount}`,
      );
      return;
    }

    // Standard is base-only: issue the next base number(s) in the picked coding via
    // the existing reservation path (ADR 0001 #6).
    const form: ReserveForm = {
      reservationType: "Document",
      documentSubtype: "Standard",
      business: selected.business,
      asset:    selected.asset,
      unit:     selected.unit,
      domain:   selected.domain,
      system:   selected.system,
      kind:     selected.kind,
      count:    clampedCount,
      sheetsPerDrawing: 1,
      sequenceType: "Existing",
      reason: `Add standard document(s) to existing coding ${selected.number}`,
    };
    const created = await createNext.mutateAsync(form);
    navigate(`/reserve/success?id=${created.id}&ref=${encodeURIComponent(created.number)}`);
  }

  const pad3 = (n: number) => String(n).padStart(3, "0");

  return (
    <div className={styles.root}>
      <Field
        label={
          documentSubtype === "Form"
            ? "Find an existing procedure number"
            : `Find an existing ${term.createsChildren ? `${term.baseNoun} number` : "coding"}`
        }
        hint="Type at least 2 characters of the coding or number."
      >
        <Input
          value={rawQuery}
          onChange={(_, data) => setRawQuery(data.value)}
          contentBefore={<Search20Regular />}
          placeholder={
            documentSubtype === "Form"
              ? "e.g. GG-9A-00-AES-AAA-PR-0001"
              : "e.g. GG-CG-00-ECS-AST-DD"
          }
        />
      </Field>

      {query.length >= 2 && (
        <div>
          {search.isFetching ? (
            <Spinner size="tiny" label="Searching…" />
          ) : (search.data?.length ?? 0) === 0 ? (
            <Text className={styles.empty}>No matching numbers found.</Text>
          ) : (
            <ExistingBaseGrid
              bases={search.data!}
              selectedId={selected?.id ?? null}
              onSelect={selectBase}
              createsChildren={term.createsChildren}
              childNoun={term.childNoun ?? "Document"}
            />
          )}
        </div>
      )}

      {selected && (
        <div className={styles.panel}>
          <Text>
            Selected <Text weight="semibold" style={{ fontFamily: "monospace" }}>{selected.number}</Text>
          </Text>

          {term.createsChildren ? (
            <Field
              label={`How many ${term.childNoun}s to add (1–${Math.max(maxCount, 0)})`}
              validationMessage={maxCount < 1 ? `This ${term.baseNoun} already has the maximum ${MAX_CHILD_ITEMS} items.` : undefined}
              validationState={maxCount < 1 ? "error" : "none"}
            >
              <Input
                className={styles.countInput}
                type="number"
                min={1}
                max={Math.max(maxCount, 1)}
                value={String(clampedCount)}
                disabled={maxCount < 1}
                onChange={(_, data) => setCount(Number(data.value) || 1)}
              />
            </Field>
          ) : (
            <Field label={`How many standard documents to add (1–${maxCount})`}>
              <Input
                className={styles.countInput}
                type="number"
                min={1}
                max={maxCount}
                value={String(clampedCount)}
                onChange={(_, data) => setCount(Number(data.value) || 1)}
              />
            </Field>
          )}

          {term.createsChildren && maxCount >= 1 && (
            <Text className={styles.title}>
              Will add {clampedCount} item(s): {selected.number}-{pad3((selected.childCount) + 1)}
              {clampedCount > 1 ? ` … ${selected.number}-${pad3(selected.childCount + clampedCount)}` : ""}
            </Text>
          )}
        </div>
      )}

      {submitError && (
        <MessageBar intent="error">
          <MessageBarBody>{submitError.message ?? "Something went wrong."}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.actions}>
        <Button appearance="secondary" onClick={onBack} disabled={submitting}>Back</Button>
        <Button
          appearance="primary"
          disabled={!selected || submitting || maxCount < 1}
          icon={submitting ? <Spinner size="tiny" /> : undefined}
          onClick={() => void handleSubmit()}
        >
          {submitting
            ? "Submitting…"
            : term.createsChildren ? `Add ${term.childNoun}s` : "Add standard document(s)"}
        </Button>
      </div>
    </div>
  );
}
