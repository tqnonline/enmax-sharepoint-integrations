import { useState } from "react";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Field,
  Input,
  Select,
  Switch,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { VALUE_TYPE, VALUE_TYPE_LABELS, type ConfigRow, type ConfigRowMutation } from "./useAppConfigAdmin";

const useStyles = makeStyles({
  form: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalM },
  actions: { display: "flex", gap: tokens.spacingHorizontalS, justifyContent: "flex-end", marginTop: tokens.spacingVerticalM },
});

interface AppConfigRowPanelProps {
  open: boolean;
  editing: ConfigRow | null;
  onClose: () => void;
  onSave: (row: ConfigRowMutation) => void;
  isSaving: boolean;
}

// Value must parse according to its declared type — a bad value here can break
// config load for the whole app (AppConfigSchema validates on boot).
function validate(value: string, valueType: number): string | null {
  if (valueType === VALUE_TYPE.INTEGER) {
    const n = parseInt(value, 10);
    if (isNaN(n) || String(n) !== value.trim()) return "Value must be a valid integer.";
  }
  if (valueType === VALUE_TYPE.JSON) {
    try { JSON.parse(value); } catch { return "Value must be valid JSON."; }
  }
  return null;
}

// The parent remounts this panel (via key) whenever it opens, so initializing
// state from props here is correct — no effect-sync needed.
export function AppConfigRowPanel({ open, editing, onClose, onSave, isSaving }: AppConfigRowPanelProps) {
  const styles = useStyles();
  const [key, setKey]             = useState(editing?.key ?? "");
  const [valueType, setValueType] = useState<number>(editing?.valueType ?? VALUE_TYPE.STRING);
  const [value, setValue]         = useState(editing?.value ?? "");
  const [error, setError]         = useState<string | null>(null);

  function handleSubmit() {
    if (!key.trim()) { setError("Key is required."); return; }
    const v = validate(value, valueType);
    if (v) { setError(v); return; }
    onSave({ id: editing?.id, key: key.trim(), value, valueType });
  }

  return (
    <Drawer open={open} onOpenChange={(_, d) => !d.open && onClose()} position="end" aria-label={editing ? "Edit configuration" : "Add configuration"}>
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label="Close" />}>
          {editing ? "Edit Configuration" : "Add Configuration"}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <form onSubmit={e => { e.preventDefault(); handleSubmit(); }} className={styles.form}>
          <Field label="Key" required>
            {/* Key is immutable on edit — it is the lookup the app reads config by. */}
            <Input value={key} onChange={(_, d) => setKey(d.value)} disabled={!!editing} aria-required="true" />
          </Field>

          <Field label="Type">
            <Select
              value={String(valueType)}
              onChange={(_, d) => { setValueType(Number(d.value)); setError(null); }}
              aria-label="Value type"
            >
              {Object.entries(VALUE_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Value" validationMessage={error ?? undefined} validationState={error ? "error" : "none"}>
            {valueType === VALUE_TYPE.BOOLEAN ? (
              <Switch checked={value === "true"} onChange={(_, d) => setValue(d.checked ? "true" : "false")} aria-label="Value" />
            ) : valueType === VALUE_TYPE.JSON ? (
              <Textarea value={value} onChange={(_, d) => { setValue(d.value); setError(null); }} rows={5} aria-label="Value" />
            ) : (
              <Input
                type={valueType === VALUE_TYPE.INTEGER ? "number" : "text"}
                value={value}
                onChange={(_, d) => { setValue(d.value); setError(null); }}
                aria-label="Value"
              />
            )}
          </Field>

          <div className={styles.actions}>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
            <Button appearance="primary" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </DrawerBody>
    </Drawer>
  );
}
