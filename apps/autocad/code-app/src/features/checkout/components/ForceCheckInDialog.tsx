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
import { useForceCheckin } from "../hooks/useForceCheckin";

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
}

export function ForceCheckInDialog({ checkoutId }: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useForceCheckin();

  function handleOpen() {
    setReason("");
    mutation.reset();
    setOpen(true);
  }

  function handleConfirm() {
    if (reason.length < 10) return;
    mutation.mutate(
      { checkoutId, reason },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <>
      <Button
        appearance="outline"
        style={{ color: tokens.colorPaletteRedForeground1, borderColor: tokens.colorPaletteRedForeground1 }}
        onClick={handleOpen}
      >
        Force Check-In
      </Button>

      <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) setOpen(false); }}>
        <DialogSurface>
          <DialogTitle>Force Check-In</DialogTitle>
          <DialogBody>
            <DialogContent>
              <div className={styles.warningStripe}>
                <Warning24Regular />
                <Text weight="semibold">Admin override — the checked-out user will be notified.</Text>
              </div>

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
                disabled={reason.length < 10 || mutation.isPending}
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
