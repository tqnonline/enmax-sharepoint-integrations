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
  Spinner,
} from "@fluentui/react-components";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting: boolean;
}

export function DeclineDialog({ open, onClose, onConfirm, isSubmitting }: Props) {
  const [reason, setReason] = useState("");
  const isValid = reason.trim().length >= 10;

  function handleConfirm() {
    if (isValid) onConfirm(reason.trim());
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogTitle>Decline reservation</DialogTitle>
        <DialogBody>
          <DialogContent>
            <Field
              label="Reason for declining"
              validationMessage={reason && !isValid ? "Reason must be at least 10 characters" : undefined}
              required
            >
              <Textarea
                value={reason}
                onChange={(_, d) => setReason(d.value)}
                placeholder="Explain why this reservation is declined (min 10 chars)"
                rows={4}
                disabled={isSubmitting}
              />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={handleConfirm}
              disabled={!isValid || isSubmitting}
            >
              {isSubmitting ? <Spinner size="tiny" label="Declining…" /> : "Confirm decline"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
