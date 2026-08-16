import { useEffect, useState } from "react";
import {
  OverlayDrawer, DrawerHeader, DrawerHeaderTitle, DrawerBody,
  Button, Field, Input, Textarea, Dropdown, Option, Checkbox, Switch, Text, Spinner,
  tokens, makeStyles,
} from "@fluentui/react-components";
import { Dismiss24Regular } from "@fluentui/react-icons";
import type { Enmax_autocadbroadcasts } from "../../generated/models/Enmax_autocadbroadcastsModel";
import {
  AUDIENCE_OPTS, SEVERITY_OPTS, audienceToCsv, csvToAudience, computeDisplayStatus, validateBroadcast,
} from "./broadcastUtils";
import { useSaveBroadcast, useRetireBroadcast, useDeleteBroadcast } from "./useBroadcasts";

function pad(n: number): string { return String(n).padStart(2, "0"); }
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
function defaultStart(): string { return toLocalInput(new Date().toISOString()); }
function defaultExpiry(): string { const d = new Date(); d.setDate(d.getDate() + 7); return toLocalInput(d.toISOString()); }

const useStyles = makeStyles({
  form: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, paddingBottom: tokens.spacingVerticalXXL },
  checks: { display: "flex", gap: tokens.spacingHorizontalL, flexWrap: "wrap" },
  actions: { display: "flex", gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalM, flexWrap: "wrap" },
  error: { color: tokens.colorPaletteRedForeground1, display: "block" },
});

interface Props {
  broadcast: Enmax_autocadbroadcasts | null;
  open: boolean;
  onClose: () => void;
}

export function BroadcastEditorDrawer({ broadcast, open, onClose }: Props) {
  const styles = useStyles();
  const isEdit = !!broadcast?.enmax_autocadbroadcastid;
  const save = useSaveBroadcast();
  const retire = useRetireBroadcast();
  const del = useDeleteBroadcast();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState(1);
  const [audience, setAudience] = useState<number[]>([4]);
  const [startsAt, setStartsAt] = useState(defaultStart());
  const [expiresAt, setExpiresAt] = useState(defaultExpiry());
  const [pinned, setPinned] = useState(false);
  const [requiresAck, setRequiresAck] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Intentional: re-seed the whole form from the target broadcast each time the drawer opens.
    /* eslint-disable react-hooks/set-state-in-effect */
    setTouched(false);
    save.reset(); retire.reset(); del.reset();
    setTitle(broadcast?.enmax_acdntitle ?? "");
    setBody(broadcast?.enmax_acdnbody ?? "");
    setSeverity(broadcast?.enmax_acdnseverity ?? 1);
    setAudience(broadcast ? csvToAudience(broadcast.enmax_acdnaudience) : [4]);
    setStartsAt(toLocalInput(broadcast?.enmax_acdnstartsat) || defaultStart());
    setExpiresAt(toLocalInput(broadcast?.enmax_acdnexpiresat) || defaultExpiry());
    setPinned(broadcast?.enmax_acdnpinned ?? false);
    setRequiresAck(broadcast?.enmax_acdnrequiresack ?? false);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, broadcast?.enmax_autocadbroadcastid]);

  const errors = validateBroadcast({ title, body, audience, startsAt, expiresAt });
  const hasErrors = Object.keys(errors).length > 0;

  function toggleAudience(v: number, checked: boolean) {
    setAudience((prev) => (checked ? [...new Set([...prev, v])] : prev.filter((x) => x !== v)));
  }

  function handleSave() {
    setTouched(true);
    if (hasErrors) return;
    save.mutate(
      {
        id: broadcast?.enmax_autocadbroadcastid,
        title, body, severity, audience: audienceToCsv(audience),
        startsAt: fromLocalInput(startsAt), expiresAt: fromLocalInput(expiresAt),
        pinned, requiresAck,
      },
      { onSuccess: onClose },
    );
  }

  const displayStatus = broadcast ? computeDisplayStatus(broadcast) : "Draft";
  const canDelete = isEdit && displayStatus === "Draft";

  return (
    <OverlayDrawer open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }} position="end" size="medium" modalType="non-modal">
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} aria-label="Close" />}>
          {isEdit ? "Edit broadcast" : "New broadcast"}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <div className={styles.form}>
          <Field label="Title" required validationState={touched && errors.title ? "error" : "none"} validationMessage={touched ? errors.title : undefined}>
            <Input value={title} onChange={(_, d) => setTitle(d.value)} placeholder="Short headline (5–120 chars)" />
          </Field>

          <Field label="Body" required validationState={touched && errors.body ? "error" : "none"} validationMessage={touched ? errors.body : undefined}>
            <Textarea value={body} onChange={(_, d) => setBody(d.value)} rows={5} placeholder="Message (10–4000 chars)" />
          </Field>

          <Field label="Severity">
            <Dropdown
              value={SEVERITY_OPTS.find((o) => o.value === severity)?.label ?? "Info"}
              selectedOptions={[String(severity)]}
              onOptionSelect={(_, d) => setSeverity(parseInt(d.optionValue ?? "1", 10))}
            >
              {SEVERITY_OPTS.map((o) => <Option key={o.value} value={String(o.value)}>{o.label}</Option>)}
            </Dropdown>
          </Field>

          <Field label="Audience" required validationState={touched && errors.audience ? "error" : "none"} validationMessage={touched ? errors.audience : undefined}>
            <div className={styles.checks}>
              {AUDIENCE_OPTS.map((o) => (
                <Checkbox key={o.value} label={o.label} checked={audience.includes(o.value)} onChange={(_, d) => toggleAudience(o.value, !!d.checked)} />
              ))}
            </div>
          </Field>

          <Field label="Starts at">
            <Input type="datetime-local" value={startsAt} onChange={(_, d) => setStartsAt(d.value)} />
          </Field>

          <Field label="Expires at" required validationState={touched && errors.expiresAt ? "error" : "none"} validationMessage={touched ? errors.expiresAt : undefined}>
            <Input type="datetime-local" value={expiresAt} onChange={(_, d) => setExpiresAt(d.value)} />
          </Field>

          <Switch label="Pinned — shows on Home for the audience" checked={pinned} onChange={(_, d) => setPinned(d.checked)} />
          <Switch label="Requires acknowledgement" checked={requiresAck} onChange={(_, d) => setRequiresAck(d.checked)} />

          {(save.isError || retire.isError || del.isError) && (
            <Text className={styles.error} size={200}>Action failed. Try again.</Text>
          )}

          <div className={styles.actions}>
            <Button appearance="primary" onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? <Spinner size="tiny" /> : isEdit ? "Save changes" : "Create broadcast"}
            </Button>
            <Button appearance="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
            {isEdit && displayStatus !== "Retired" && (
              <Button appearance="outline" style={{ marginLeft: "auto" }} disabled={retire.isPending}
                onClick={() => retire.mutate(broadcast!.enmax_autocadbroadcastid, { onSuccess: onClose })}>
                Retire
              </Button>
            )}
            {canDelete && (
              <Button appearance="subtle" disabled={del.isPending}
                onClick={() => del.mutate(broadcast!.enmax_autocadbroadcastid, { onSuccess: onClose })}>
                Delete
              </Button>
            )}
          </div>
        </div>
      </DrawerBody>
    </OverlayDrawer>
  );
}
