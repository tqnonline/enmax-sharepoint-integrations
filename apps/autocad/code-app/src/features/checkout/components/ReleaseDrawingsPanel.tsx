import { useState } from "react";
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Field,
  Textarea,
  Checkbox,
  Text,
  Spinner,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { useReleaseDrawing } from "../hooks/useReleaseDrawing";
import { DrawingState } from "../api/checkoutClient";
import type { DrawingForPanel } from "../api/checkoutClient";

const useStyles = makeStyles({
  intro: { display: "block", marginBottom: tokens.spacingVerticalS, color: tokens.colorNeutralForeground3 },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    marginBottom: tokens.spacingVerticalM,
    maxHeight: "240px",
    overflowY: "auto",
  },
  row: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
  num: { fontFamily: "monospace" },
  empty: { color: tokens.colorNeutralForeground3 },
  error: { color: tokens.colorPaletteRedForeground1, display: "block", marginTop: tokens.spacingVerticalXS },
});

interface Props {
  drawings: DrawingForPanel[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Single-reservation batch release of unused (Available) drawing numbers.
 * Releases each selected drawing sequentially via enmax_acdnReleaseDrawing so the
 * audit trail records one event per drawing (mirrors the bulk-approve linear pattern).
 */
export function ReleaseDrawingsPanel({ drawings, open, onOpenChange }: Props) {
  const styles = useStyles();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = (o: boolean) => { if (onOpenChange) onOpenChange(o); else setInternalOpen(o); };

  // Only never-checked-out numbers are releasable. currentRevision is set on first
  // check-in, so it is the cheap proxy for "used"; the plug-in enforces the
  // authoritative "no checkout rows" rule. Mirrors DrawingActionsPanel's canRelease.
  const available = drawings.filter((d) => d.state === DrawingState.Available && !d.currentRevision);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mutation = useReleaseDrawing();

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function handleRelease() {
    if (selected.size === 0 || reason.trim().length < 10) return;
    setBusy(true);
    setError(null);
    try {
      for (const id of selected) {
        await mutation.mutateAsync({ drawingId: id, reason: reason.trim() });
      }
      setOpen(false);
      setSelected(new Set());
      setReason("");
    } catch (e) {
      setError((e as Error)?.message ?? "Release failed. Some drawings may not have been released.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(_, d) => { if (!d.open) setOpen(false); }}>
      <DialogSurface>
        <DialogTitle>Release unused drawings</DialogTitle>
        <DialogBody>
          <DialogContent>
            <Text size={200} className={styles.intro}>
              Released numbers stay reserved and are never reused. This cannot be undone.
            </Text>
            {available.length === 0 ? (
              <Text className={styles.empty}>No Available drawings to release.</Text>
            ) : (
              <div className={styles.list}>
                {available.map((d) => (
                  <div key={d.id} className={styles.row}>
                    <Checkbox
                      aria-label={`select ${d.number ?? d.id}`}
                      checked={selected.has(d.id)}
                      onChange={(_, data) => toggle(d.id, !!data.checked)}
                    />
                    <Text className={styles.num}>{d.number ?? d.id}</Text>
                  </div>
                ))}
              </div>
            )}
            <Field
              label="Reason (required)"
              validationMessage={reason.length > 0 && reason.trim().length < 10 ? "Minimum 10 characters" : undefined}
              validationState={reason.length > 0 && reason.trim().length < 10 ? "error" : "none"}
              required
            >
              <Textarea
                placeholder="Why are these numbers being released? (min 10 chars)"
                value={reason}
                onChange={(_, d) => setReason(d.value)}
                rows={3}
              />
            </Field>
            {error && <Text className={styles.error} size={200}>{error}</Text>}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              appearance="primary"
              disabled={selected.size === 0 || reason.trim().length < 10 || busy}
              onClick={handleRelease}
            >
              {busy ? <Spinner size="tiny" /> : `Release ${selected.size}`}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
