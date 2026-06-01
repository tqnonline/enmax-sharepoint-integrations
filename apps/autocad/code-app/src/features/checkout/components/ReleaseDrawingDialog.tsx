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
  Text,
  Spinner,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { Warning24Regular } from "@fluentui/react-icons";
import { useReleaseDrawing } from "../hooks/useReleaseDrawing";

const useStyles = makeStyles({
  warningStripe: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorPaletteRedBackground2,
    borderRadius: tokens.borderRadiusMedium,
    marginBottom: tokens.spacingVerticalM,
    color: tokens.colorPaletteRedForeground1,
  },
  note: { display: "block", marginBottom: tokens.spacingVerticalS, color: tokens.colorNeutralForeground3 },
  error: { color: tokens.colorPaletteRedForeground1, display: "block", marginTop: tokens.spacingVerticalXS },
});

interface Props {
  drawingId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  /** True when an admin releases a drawing they do not own — the owner is notified. */
  forceRelease?: boolean;
  onReleased?: () => void;
}

export function ReleaseDrawingDialog({ drawingId, open, onOpenChange, hideTrigger, forceRelease, onReleased }: Props) {
  const styles = useStyles();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = (o: boolean) => { if (onOpenChange) onOpenChange(o); else setInternalOpen(o); };
  const [reason, setReason] = useState("");
  const mutation = useReleaseDrawing();

  function handleOpen() { setReason(""); mutation.reset(); setOpen(true); }
  function handleConfirm() {
    if (reason.trim().length < 10) return;
    mutation.mutate(
      { drawingId, reason: reason.trim() },
      { onSuccess: () => { setOpen(false); onReleased?.(); } },
    );
  }

  return (
    <>
      {!hideTrigger && (
        <Button appearance="outline" onClick={handleOpen}>Release</Button>
      )}
      <Dialog open={isOpen} onOpenChange={(_, d) => { if (!d.open) setOpen(false); }}>
        <DialogSurface>
          <DialogTitle>Release reserved drawing</DialogTitle>
          <DialogBody>
            <DialogContent>
              {forceRelease && (
                <div className={styles.warningStripe}>
                  <Warning24Regular />
                  <Text weight="semibold">
                    You are releasing a drawing owned by another user on their behalf. They will be notified.
                  </Text>
                </div>
              )}
              <Text size={200} className={styles.note}>
                The number stays reserved and is never reused. This cannot be undone.
              </Text>
              <Field
                label="Reason (required)"
                validationMessage={reason.length > 0 && reason.trim().length < 10 ? "Minimum 10 characters" : undefined}
                validationState={reason.length > 0 && reason.trim().length < 10 ? "error" : "none"}
                required
              >
                <Textarea
                  placeholder="Why is this number being released? (min 10 chars)"
                  value={reason}
                  onChange={(_, d) => setReason(d.value)}
                  rows={3}
                />
              </Field>
              {mutation.isError && (
                <Text className={styles.error} size={200}>{mutation.error?.message ?? "Release failed. Try again."}</Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
              <Button
                appearance="primary"
                disabled={reason.trim().length < 10 || mutation.isPending}
                onClick={handleConfirm}
              >
                {mutation.isPending ? <Spinner size="tiny" /> : "Confirm Release"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
