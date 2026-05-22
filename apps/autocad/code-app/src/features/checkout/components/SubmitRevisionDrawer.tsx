import { useState } from "react";
import {
  OverlayDrawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Button,
  Input,
  Checkbox,
  Field,
  Text,
  Spinner,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { Dismiss24Regular, DocumentEdit24Regular } from "@fluentui/react-icons";
import { useSubmitRevision } from "../hooks/useSubmitRevision";
import { useCheckIn } from "../hooks/useCheckIn";
import { nextRevision } from "../api/checkoutClient";
import { useAppConfig } from "../../../config/useAppConfig";

const useStyles = makeStyles({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalXXL,
  },
  libraryLink: {
    fontFamily: "monospace",
    wordBreak: "break-all",
    color: tokens.colorBrandForeground1,
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
  currentRevision?: string;
  spLibraryUrl?: string;
}

export function SubmitRevisionDrawer({ checkoutId, drawingId, currentRevision, spLibraryUrl }: Props) {
  const styles = useStyles();
  const { RequireCheckInApproval } = useAppConfig();
  const [open, setOpen] = useState(false);
  const [newRevision, setNewRevision] = useState(() => nextRevision(currentRevision));
  const [filesConfirmed, setFilesConfirmed] = useState(false);
  const submitMutation = useSubmitRevision();
  const checkInMutation = useCheckIn();
  const mutation = RequireCheckInApproval ? submitMutation : checkInMutation;

  function handleOpen() {
    setNewRevision(nextRevision(currentRevision));
    setFilesConfirmed(false);
    mutation.reset();
    setOpen(true);
  }

  function handleSubmit() {
    if (!newRevision.trim() || !filesConfirmed) return;
    mutation.mutate(
      { checkoutId, drawingId, newRevision: newRevision.trim() },
      { onSuccess: () => setOpen(false) },
    );
  }

  const canSubmit = newRevision.trim().length > 0 && filesConfirmed && !mutation.isPending;

  return (
    <>
      <Button
        appearance="primary"
        icon={<DocumentEdit24Regular />}
        onClick={handleOpen}
      >
        {RequireCheckInApproval ? "Submit Revision" : "Check In"}
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
            {RequireCheckInApproval ? "Submit Revision" : "Check In"}
          </DrawerHeaderTitle>
        </DrawerHeader>

        <DrawerBody>
          <div className={styles.body}>
            <Field label="New revision identifier" required>
              <Input
                value={newRevision}
                onChange={(_, d) => setNewRevision(d.value)}
                placeholder="e.g. B or 02"
                aria-label="New revision identifier"
              />
            </Field>

            <div className={styles.confirmationBox}>
              <Checkbox
                label={
                  <span>
                    I have uploaded the revised PDFs to the SharePoint library
                    {spLibraryUrl ? (
                      <>
                        {" at: "}
                        <a
                          href={spLibraryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.libraryLink}
                        >
                          {spLibraryUrl}
                        </a>
                      </>
                    ) : (
                      " for this drawing"
                    )}
                  </span>
                }
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
