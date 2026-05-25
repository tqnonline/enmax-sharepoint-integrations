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
import { useMarkObsolete } from "../hooks/useMarkObsolete";

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

export function MarkObsoleteDialog({ drawingId, open, onOpenChange, hideTrigger }: Props) {
  const styles = useStyles();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = (o: boolean) => { if (onOpenChange) onOpenChange(o); else setInternalOpen(o); };
  const [reason, setReason] = useState("");
  const mutation = useMarkObsolete();

  function handleOpen() { setReason(""); mutation.reset(); setOpen(true); }
  function handleConfirm() {
    mutation.mutate({ drawingId, reason: reason.trim() || undefined }, { onSuccess: () => setOpen(false) });
  }

  return (
    <>
      {!hideTrigger && <Button appearance="outline" onClick={handleOpen}>Mark Obsolete</Button>}
      <Dialog open={isOpen} onOpenChange={(_, d) => { if (!d.open) setOpen(false); }}>
        <DialogSurface>
          <DialogTitle>Mark drawing obsolete</DialogTitle>
          <DialogBody>
            <DialogContent>
              <Text className={styles.intro}>
                Marking obsolete flags this drawing and its sheets as "do not use". This is terminal and cannot be undone.
              </Text>
              <Field label="Reason (optional)">
                <Textarea
                  placeholder="Optional note explaining why this is obsolete"
                  value={reason}
                  onChange={(_, d) => setReason(d.value)}
                  rows={3}
                />
              </Field>
              {mutation.isError && (
                <Text className={styles.error} size={200}>{mutation.error?.message ?? "Mark obsolete failed. Try again."}</Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
              <Button appearance="primary" disabled={mutation.isPending} onClick={handleConfirm}>
                {mutation.isPending ? <Spinner size="tiny" /> : "Confirm Obsolete"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
