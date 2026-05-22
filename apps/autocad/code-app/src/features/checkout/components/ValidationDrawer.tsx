import { useState } from "react";
import {
  OverlayDrawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Button,
  Field,
  Textarea,
  Text,
  MessageBar,
  MessageBarBody,
  Spinner,
  Divider,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import {
  Dismiss24Regular,
  CheckmarkCircle24Regular,
  DismissCircle24Regular,
  DocumentSearch24Regular,
} from "@fluentui/react-icons";
import { useApproveCheckin } from "../hooks/useApproveCheckin";
import { parsePdfUrls } from "../api/checkoutClient";
import type { CheckoutForPanel, DrawingForPanel } from "../api/checkoutClient";

const useStyles = makeStyles({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalXXL,
  },
  field: {
    display: "grid",
    gridTemplateColumns: "110px 1fr",
    gap: tokens.spacingHorizontalS,
    alignItems: "start",
  },
  label: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    paddingTop: "2px",
  },
  pdfList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  pdfLink: {
    color: tokens.colorBrandForeground1,
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase200,
    overflowWrap: "break-word",
    wordBreak: "break-all",
  },
  actions: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
    flexWrap: "wrap",
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
    display: "block",
  },
  declineSection: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
});

interface Props {
  checkout: CheckoutForPanel;
  drawing: DrawingForPanel;
}

export function ValidationDrawer({ checkout, drawing }: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const mutation = useApproveCheckin();

  const pdfUrls = parsePdfUrls(checkout.newPdfUrls);
  const hasMissingSheets = !!drawing.missingSheets;

  function handleOpen() {
    setShowDecline(false);
    setDeclineReason("");
    mutation.reset();
    setOpen(true);
  }

  function handleClose() {
    setShowDecline(false);
    setDeclineReason("");
    mutation.reset();
    setOpen(false);
  }

  function handleApprove() {
    mutation.mutate(
      { checkoutId: checkout.id, decision: "Approved" },
      { onSuccess: handleClose },
    );
  }

  function handleDecline() {
    if (declineReason.length < 10) return;
    mutation.mutate(
      { checkoutId: checkout.id, decision: "Declined", reason: declineReason },
      { onSuccess: handleClose },
    );
  }

  return (
    <>
      <Button
        appearance="primary"
        icon={<DocumentSearch24Regular />}
        onClick={handleOpen}
      >
        Review Revision
      </Button>

      <OverlayDrawer
        open={open}
        onOpenChange={(_, data) => { if (!data.open) handleClose(); }}
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
                onClick={handleClose}
                aria-label="Close"
              />
            }
          >
            Validate Revision
          </DrawerHeaderTitle>
        </DrawerHeader>

        <DrawerBody>
          <div className={styles.body}>
            {checkout.newRevision && (
              <div className={styles.field}>
                <span className={styles.label}>New revision</span>
                <Text weight="semibold">{checkout.newRevision}</Text>
              </div>
            )}

            <div className={styles.field}>
              <span className={styles.label}>PDF files</span>
              <div>
                {pdfUrls.length === 0 ? (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    No URLs captured yet
                  </Text>
                ) : (
                  <ul className={styles.pdfList}>
                    {pdfUrls.map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.pdfLink}
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {hasMissingSheets && (
              <MessageBar intent="warning">
                <MessageBarBody>
                  Missing sheets: {drawing.missingSheets}. Verify all sheets are uploaded before approving.
                </MessageBarBody>
              </MessageBar>
            )}

            {mutation.isError && (
              <Text className={styles.error} size={200}>
                {mutation.error?.message ?? "Action failed. Try again."}
              </Text>
            )}

            <Divider />

            {!showDecline ? (
              <div className={styles.actions}>
                <Button
                  appearance="primary"
                  icon={<CheckmarkCircle24Regular />}
                  disabled={hasMissingSheets || mutation.isPending}
                  onClick={handleApprove}
                >
                  {mutation.isPending ? <Spinner size="tiny" /> : "Approve"}
                </Button>
                <Button
                  appearance="secondary"
                  icon={<DismissCircle24Regular />}
                  disabled={mutation.isPending}
                  onClick={() => setShowDecline(true)}
                >
                  Decline
                </Button>
              </div>
            ) : (
              <div className={styles.declineSection}>
                <Text weight="semibold">Decline reason</Text>
                <Field
                  validationMessage={
                    declineReason.length > 0 && declineReason.length < 10
                      ? "Minimum 10 characters"
                      : undefined
                  }
                  validationState={
                    declineReason.length > 0 && declineReason.length < 10 ? "error" : "none"
                  }
                >
                  <Textarea
                    placeholder="Explain why the revision is declined (min 10 chars)"
                    value={declineReason}
                    onChange={(_, d) => setDeclineReason(d.value)}
                    rows={3}
                  />
                </Field>
                <div className={styles.actions}>
                  <Button
                    appearance="primary"
                    disabled={declineReason.length < 10 || mutation.isPending}
                    onClick={handleDecline}
                  >
                    {mutation.isPending ? <Spinner size="tiny" /> : "Confirm decline"}
                  </Button>
                  <Button
                    appearance="secondary"
                    onClick={() => setShowDecline(false)}
                    disabled={mutation.isPending}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DrawerBody>
      </OverlayDrawer>
    </>
  );
}
