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
import { useMarkVoid } from "../hooks/useMarkVoid";

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
  error: { color: tokens.colorPaletteRedForeground1, display: "block", marginTop: tokens.spacingVerticalXS },
});

interface Props {
  drawingId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function MarkVoidDialog({ drawingId, open, onOpenChange, hideTrigger }: Props) {
  const styles = useStyles();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = (o: boolean) => { if (onOpenChange) onOpenChange(o); else setInternalOpen(o); };
  const [reason, setReason] = useState("");
  const mutation = useMarkVoid();

  function handleOpen() { setReason(""); mutation.reset(); setOpen(true); }
  function handleConfirm() {
    if (reason.trim().length < 10) return;
    mutation.mutate({ drawingId, reason: reason.trim() }, { onSuccess: () => setOpen(false) });
  }

  return (
    <>
      {!hideTrigger && (
        <Button
          appearance="outline"
          style={{ color: tokens.colorPaletteRedForeground1, borderColor: tokens.colorPaletteRedForeground1 }}
          onClick={handleOpen}
        >
          Mark Void
        </Button>
      )}
      <Dialog open={isOpen} onOpenChange={(_, d) => { if (!d.open) setOpen(false); }}>
        <DialogSurface>
          <DialogTitle>Void drawing</DialogTitle>
          <DialogBody>
            <DialogContent>
              <div className={styles.warningStripe}>
                <Warning24Regular />
                <Text weight="semibold">Voiding cancels this drawing and all its sheets. Terminal — cannot be undone.</Text>
              </div>
              <Field
                label="Reason (required)"
                validationMessage={reason.length > 0 && reason.trim().length < 10 ? "Minimum 10 characters" : undefined}
                validationState={reason.length > 0 && reason.trim().length < 10 ? "error" : "none"}
                required
              >
                <Textarea
                  placeholder="Why is this drawing being cancelled? (min 10 chars)"
                  value={reason}
                  onChange={(_, d) => setReason(d.value)}
                  rows={3}
                />
              </Field>
              {mutation.isError && (
                <Text className={styles.error} size={200}>{mutation.error?.message ?? "Void failed. Try again."}</Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
              <Button
                appearance="primary"
                style={{ backgroundColor: tokens.colorPaletteRedBackground3, color: tokens.colorNeutralForegroundOnBrand }}
                disabled={reason.trim().length < 10 || mutation.isPending}
                onClick={handleConfirm}
              >
                {mutation.isPending ? <Spinner size="tiny" /> : "Confirm Void"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
