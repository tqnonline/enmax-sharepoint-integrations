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
  Input,
  Textarea,
  Text,
  Spinner,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { Warning24Regular } from "@fluentui/react-icons";
import { useForceCheckin } from "../hooks/useForceCheckin";
import { nextRevision } from "../api/checkoutClient";

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
  error: {
    color: tokens.colorPaletteRedForeground1,
    display: "block",
    marginTop: tokens.spacingVerticalXS,
  },
});

interface Props {
  checkoutId: string;
  drawingId: string;
  currentRevision?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function ForceCheckInDialog({ checkoutId, drawingId, currentRevision, open, onOpenChange, hideTrigger }: Props) {
  const styles = useStyles();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = (o: boolean) => { if (onOpenChange) onOpenChange(o); else setInternalOpen(o); };
  const [reason, setReason] = useState("");
  const [newRevision, setNewRevision] = useState("");
  const mutation = useForceCheckin();

  function handleOpen() {
    setReason("");
    setNewRevision(nextRevision(currentRevision));
    mutation.reset();
    setOpen(true);
  }

  function handleConfirm() {
    if (reason.length < 10 || !newRevision.trim()) return;
    mutation.mutate(
      { checkoutId, drawingId, newRevision: newRevision.trim(), reason },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <>
      {!hideTrigger && (
        <Button
          appearance="outline"
          style={{ color: tokens.colorPaletteRedForeground1, borderColor: tokens.colorPaletteRedForeground1 }}
          onClick={handleOpen}
        >
          Force Check-In
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={(_, d) => { if (!d.open) setOpen(false); }}>
        <DialogSurface>
          <DialogTitle>Force Check-In</DialogTitle>
          <DialogBody>
            <DialogContent>
              <div className={styles.warningStripe}>
                <Warning24Regular />
                <Text weight="semibold">Admin override — the checked-out user will be notified.</Text>
              </div>

              <Field label="Final revision number (required)" required>
                <Input
                  value={newRevision}
                  onChange={(_, d) => setNewRevision(d.value)}
                  placeholder="e.g. C or 03"
                  aria-label="Final revision number"
                />
              </Field>

              <Field
                label="Reason (required)"
                validationMessage={
                  reason.length > 0 && reason.length < 10 ? "Minimum 10 characters" : undefined
                }
                validationState={reason.length > 0 && reason.length < 10 ? "error" : "none"}
                required
              >
                <Textarea
                  placeholder="Explain why the check-out is being force-closed (min 10 chars)"
                  value={reason}
                  onChange={(_, d) => setReason(d.value)}
                  rows={3}
                />
              </Field>

              {mutation.isError && (
                <Text className={styles.error} size={200}>
                  {mutation.error?.message ?? "Force check-in failed. Try again."}
                </Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                style={{
                  backgroundColor: tokens.colorPaletteRedBackground3,
                  color: tokens.colorNeutralForegroundOnBrand,
                }}
                disabled={reason.length < 10 || !newRevision.trim() || mutation.isPending}
                onClick={handleConfirm}
              >
                {mutation.isPending ? <Spinner size="tiny" /> : "Confirm Force Check-In"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
