import { useState } from "react";
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogActions,
  Button,
  Textarea,
  Checkbox,
  Field,
  Text,
  Spinner,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { DocumentEdit24Regular } from "@fluentui/react-icons";
import { useSubmitRevision } from "../hooks/useSubmitRevision";
import { useAppConfig } from "../../../config/useAppConfig";
import { SharePointLibraryEmbed } from "../../sharepoint/SharePointLibraryEmbed";

const useStyles = makeStyles({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  confirmationBox: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
    display: "block",
  },
  surface: {
    maxWidth: "920px",
    width: "min(92vw, 920px)",
  },
});

interface Props {
  checkoutId: string;
  drawingId: string;
  drawingNumber: string;
}

/**
 * Check In flow — modal (not a nested drawer) with embedded SharePoint library.
 * Opens over the drawing detail panel without stacking multiple flyouts.
 */
export function SubmitRevisionDrawer({ checkoutId, drawingId, drawingNumber }: Props) {
  const styles = useStyles();
  const { RequireCheckInApproval } = useAppConfig();
  const [open, setOpen] = useState(false);
  const [submissionInfo, setSubmissionInfo] = useState("");
  const [filesConfirmed, setFilesConfirmed] = useState(false);
  const mutation = useSubmitRevision();

  function handleOpen() {
    setSubmissionInfo("");
    setFilesConfirmed(false);
    mutation.reset();
    setOpen(true);
  }

  function handleSubmit() {
    if (!submissionInfo.trim() || !filesConfirmed) return;
    mutation.mutate(
      { checkoutId, drawingId, submissionInfo: submissionInfo.trim() },
      { onSuccess: () => setOpen(false) },
    );
  }

  const canSubmit = submissionInfo.trim().length > 0 && filesConfirmed && !mutation.isPending;
  const title = drawingNumber ? `Check In — ${drawingNumber}` : "Check In";

  return (
    <>
      <Button
        appearance="primary"
        icon={<DocumentEdit24Regular />}
        onClick={handleOpen}
      >
        Check In
      </Button>

      <Dialog
        open={open}
        onOpenChange={(_, data) => { if (!data.open) setOpen(false); }}
        modalType="modal"
      >
        <DialogSurface className={styles.surface} aria-describedby={undefined}>
          <DialogBody>
            <DialogTitle>{title}</DialogTitle>

            <div className={styles.body}>
              <Field
                label="Submission information"
                hint="Project, WO#, and any context an approver needs. Required."
                required
              >
                <Textarea
                  value={submissionInfo}
                  onChange={(_, d) => setSubmissionInfo(d.value)}
                  placeholder="e.g. Project Falcon, WO#12345 — issued-for-construction update"
                  aria-label="Submission information"
                  rows={3}
                  resize="vertical"
                />
              </Field>

              <SharePointLibraryEmbed recordNumber={drawingNumber} enabled />

              <div className={styles.confirmationBox}>
                <Checkbox
                  label="I have uploaded the revised PDF to the SharePoint library above"
                  checked={filesConfirmed}
                  onChange={(_, d) => setFilesConfirmed(!!d.checked)}
                />
              </div>

              {mutation.isError && (
                <Text className={styles.error} size={200}>
                  {mutation.error?.message ?? "Submit failed. Try again."}
                </Text>
              )}
            </div>

            <DialogActions>
              <Button appearance="secondary" onClick={() => setOpen(false)} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {mutation.isPending
                  ? <Spinner size="tiny" label={RequireCheckInApproval ? "Submitting…" : "Checking in…"} />
                  : RequireCheckInApproval ? "Submit for Validation" : "Confirm Check In"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
