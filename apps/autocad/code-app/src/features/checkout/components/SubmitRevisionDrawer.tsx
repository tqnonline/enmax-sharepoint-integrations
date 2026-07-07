import { useState } from "react";
import {
  OverlayDrawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Button,
  Textarea,
  Checkbox,
  Field,
  Text,
  Spinner,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { Dismiss24Regular, DocumentEdit24Regular, ArrowUpload24Regular } from "@fluentui/react-icons";
import { useSubmitRevision } from "../hooks/useSubmitRevision";
import { useAppConfig } from "../../../config/useAppConfig";

const useStyles = makeStyles({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalXXL,
  },
  confirmationBox: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  actions: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalM,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
    display: "block",
  },
});

interface Props {
  checkoutId: string;
  drawingId: string;
}

export function SubmitRevisionDrawer({ checkoutId, drawingId }: Props) {
  const styles = useStyles();
  const { RequireCheckInApproval, CheckInUploadLibraryUrl } = useAppConfig();
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

  return (
    <>
      <Button
        appearance="primary"
        icon={<DocumentEdit24Regular />}
        onClick={handleOpen}
      >
        Check In
      </Button>

      <OverlayDrawer
        open={open}
        onOpenChange={(_, data) => { if (!data.open) setOpen(false); }}
        position="end"
        size="small"
        modalType="non-modal"
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button
                appearance="subtle"
                icon={<Dismiss24Regular />}
                onClick={() => setOpen(false)}
                aria-label="Close"
              />
            }
          >
            Check In
          </DrawerHeaderTitle>
        </DrawerHeader>

        <DrawerBody>
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
                rows={4}
                resize="vertical"
              />
            </Field>

            {CheckInUploadLibraryUrl && (
              <Button
                as="a"
                href={CheckInUploadLibraryUrl}
                target="_blank"
                rel="noopener noreferrer"
                icon={<ArrowUpload24Regular />}
                appearance="secondary"
              >
                Upload Drawings to SharePoint
              </Button>
            )}

            <div className={styles.confirmationBox}>
              <Checkbox
                label="I have uploaded the revised PDFs to the SharePoint library above"
                checked={filesConfirmed}
                onChange={(_, d) => setFilesConfirmed(!!d.checked)}
              />
            </div>

            {mutation.isError && (
              <Text className={styles.error} size={200}>
                {mutation.error?.message ?? "Submit failed. Try again."}
              </Text>
            )}

            <div className={styles.actions}>
              <Button
                appearance="primary"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {mutation.isPending
                  ? <Spinner size="tiny" label={RequireCheckInApproval ? "Submitting…" : "Checking in…"} />
                  : RequireCheckInApproval ? "Submit for Validation" : "Confirm Check In"}
              </Button>
              <Button appearance="secondary" onClick={() => setOpen(false)} disabled={mutation.isPending}>
                Cancel
              </Button>
            </div>
          </div>
        </DrawerBody>
      </OverlayDrawer>
    </>
  );
}
