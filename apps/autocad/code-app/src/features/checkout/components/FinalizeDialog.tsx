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
import { Checkmark24Regular } from "@fluentui/react-icons";
import { useFinalizeDrawing } from "../hooks/useFinalizeDrawing";

const useStyles = makeStyles({
  intro: { marginBottom: tokens.spacingVerticalM, color: tokens.colorNeutralForeground2 },
  error: { color: tokens.colorPaletteRedForeground1, display: "block", marginTop: tokens.spacingVerticalXS },
});

interface Props {
  drawingId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function FinalizeDialog({ drawingId, open, onOpenChange, hideTrigger }: Props) {
  const styles = useStyles();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = (o: boolean) => { if (onOpenChange) onOpenChange(o); else setInternalOpen(o); };
  const [reason, setReason] = useState("");
  const mutation = useFinalizeDrawing();

  function handleOpen() { setReason(""); mutation.reset(); setOpen(true); }
  function handleConfirm() {
    if (reason.trim().length < 10) return;
    mutation.mutate({ drawingId, reason: reason.trim() }, { onSuccess: () => setOpen(false) });
  }

  return (
    <>
      {!hideTrigger && <Button appearance="primary" icon={<Checkmark24Regular />} onClick={handleOpen}>Finalize</Button>}
      <Dialog open={isOpen} onOpenChange={(_, d) => { if (!d.open) setOpen(false); }}>
        <DialogSurface>
          <DialogTitle>Finalize drawing</DialogTitle>
          <DialogBody>
            <DialogContent>
              <Text className={styles.intro}>
                Finalizing locks this drawing and its sheets as the final revision. No further Check Out or Check In is possible. This cannot be undone.
              </Text>
              <Field
                label="Reason (required)"
                validationMessage={reason.length > 0 && reason.trim().length < 10 ? "Minimum 10 characters" : undefined}
                validationState={reason.length > 0 && reason.trim().length < 10 ? "error" : "none"}
                required
              >
                <Textarea
                  placeholder="Why is this the final revision? (min 10 chars)"
                  value={reason}
                  onChange={(_, d) => setReason(d.value)}
                  rows={3}
                />
              </Field>
              {mutation.isError && (
                <Text className={styles.error} size={200}>{mutation.error?.message ?? "Finalize failed. Try again."}</Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
              <Button appearance="primary" disabled={reason.trim().length < 10 || mutation.isPending} onClick={handleConfirm}>
                {mutation.isPending ? <Spinner size="tiny" /> : "Confirm Finalize"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
