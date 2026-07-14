import { useState, type ReactElement } from "react";
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
import { ArrowUpload24Regular } from "@fluentui/react-icons";
import { useSubmitRevision } from "../hooks/useSubmitRevision";
import { useAppConfig } from "../../../config/useAppConfig";
import { SharePointLibraryEmbed } from "../../sharepoint/SharePointLibraryEmbed";

const useStyles = makeStyles({
  surface: {
    maxWidth: "920px",
    width: "min(92vw, 920px)",
    padding: 0,
  },
  dialogBody: {
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  title: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    paddingBottom: tokens.spacingVerticalS,
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    width: "100%",
  },
  fieldBlock: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    width: "100%",
  },
  fieldLabel: {
    padding: `0 ${tokens.spacingHorizontalL}`,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
  },
  confirmationBox: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground2,
    width: "100%",
    boxSizing: "border-box",
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
    display: "block",
    padding: `0 ${tokens.spacingHorizontalL}`,
  },
  actions: {
    padding: tokens.spacingHorizontalL,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
  },
});

interface Props {
  checkoutId: string;
  drawingId: string;
  drawingNumber: string;
  /** SharePoint site topology — drawings vs documents drop-off. */
  site?: "drawings" | "documents";
  /** Per-taxonomy library resolution; takes precedence over `site` when provided. */
  reservationType?: number | null;
  documentSubtype?: number | null;
  triggerLabel?: string;
  triggerAppearance?: "primary" | "secondary" | "outline" | "subtle";
  triggerIcon?: ReactElement;
}

/**
 * Check In flow — modal with a prominent link to the SharePoint drop-off library.
 * Opens over the drawing detail panel without stacking multiple flyouts.
 */
export function SubmitRevisionDrawer({
  checkoutId,
  drawingId,
  drawingNumber,
  site = "drawings",
  reservationType,
  documentSubtype,
  triggerLabel = "Check In",
  triggerAppearance = "secondary",
  triggerIcon = <ArrowUpload24Regular />,
}: Props) {
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
        appearance={triggerAppearance}
        icon={triggerIcon}
        onClick={handleOpen}
      >
        {triggerLabel}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(_, data) => { if (!data.open) setOpen(false); }}
        modalType="modal"
      >
        <DialogSurface className={styles.surface} aria-describedby={undefined}>
          <DialogBody className={styles.dialogBody}>
            <DialogTitle className={styles.title}>{title}</DialogTitle>

            <div className={styles.body}>
              <Field
                label={{
                  children: "Submission information",
                  className: styles.fieldLabel,
                }}
                hint={{
                  children: "Project, WO#, and any context an approver needs. Required.",
                  className: styles.fieldLabel,
                }}
                required
                className={styles.fieldBlock}
              >
                <Textarea
                  className={styles.textarea}
                  value={submissionInfo}
                  onChange={(_, d) => setSubmissionInfo(d.value)}
                  placeholder="e.g. Project Falcon, WO#12345 — issued-for-construction update"
                  aria-label="Submission information"
                  rows={3}
                  resize="vertical"
                />
              </Field>

              <SharePointLibraryEmbed
                recordNumber={drawingNumber}
                site={site}
                reservationType={reservationType}
                documentSubtype={documentSubtype}
                enabled
              />

              <div className={styles.confirmationBox}>
                <Checkbox
                  label="I have uploaded the revised PDF to the SharePoint drop-off library"
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

            <DialogActions className={styles.actions}>
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
