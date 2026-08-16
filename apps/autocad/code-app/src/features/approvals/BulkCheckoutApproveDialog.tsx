import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  ProgressBar,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { ArrowClockwise24Regular, CheckmarkCircle24Regular } from "@fluentui/react-icons";
import type { CheckinRow } from "./hooks/useCheckins";
import { bulkResultMessage, type BulkActionResult } from "./bulkActionResult";

const useStyles = makeStyles({
  list: { listStyle: "none", padding: 0, margin: 0, maxHeight: "240px", overflowY: "auto" },
  item: {
    display: "flex",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalXS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  batchLabel: {
    color: tokens.colorNeutralForeground3,
    display: "block",
    marginTop: tokens.spacingVerticalS,
  },
  progressBlock: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  statusBlock: {
    marginTop: tokens.spacingVerticalM,
  },
});

export interface CheckoutBatchGroup {
  batchKey: string;
  rows: CheckinRow[];
}

interface Props {
  open: boolean;
  groups: CheckoutBatchGroup[];
  onClose: () => void;
  onConfirm: () => void;
  onRetry?: () => void;
  isSubmitting: boolean;
  progress?: { current: number; total: number } | null;
  result?: BulkActionResult;
}

export function BulkCheckoutApproveDialog({
  open,
  groups,
  onClose,
  onConfirm,
  onRetry,
  isSubmitting,
  progress,
  result,
}: Props) {
  const styles = useStyles();
  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);
  const isDone = result != null && !isSubmitting;
  const canRetry = isDone && result.failedCount > 0 && onRetry;

  const title = isSubmitting
    ? "Approving check-out requests…"
    : result?.status === "success"
      ? "Check-out requests approved"
      : result
        ? "Some requests could not be approved"
        : `Approve ${totalRows} check-out request${totalRows === 1 ? "" : "s"}?`;

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open && !isSubmitting) onClose(); }}>
      <DialogSurface>
        <DialogTitle>{title}</DialogTitle>
        <DialogBody>
          <DialogContent>
            {!isDone && (
              <>
                {groups.map((group) => (
                  <div key={group.batchKey}>
                    <Text size={200} className={styles.batchLabel}>
                      {group.rows.length > 1
                        ? `Batch (${group.rows.length} sheets)`
                        : "Single sheet"}
                    </Text>
                    <ul className={styles.list}>
                      {group.rows.map((r) => (
                        <li key={r.checkoutId} className={styles.item}>
                          <Text style={{ fontFamily: "monospace" }}>
                            {r.documentDisplayNumber || r.drawingNumber || "—"}
                          </Text>
                          <Text>{r.submittedByName || "—"}</Text>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {!isSubmitting && (
                  <Text style={{ marginTop: tokens.spacingVerticalM, display: "block" }}>
                    Each request will be approved sequentially. The requester can upload revised files after approval.
                  </Text>
                )}
              </>
            )}

            {isSubmitting && progress && (
              <div className={styles.progressBlock} role="status" aria-live="polite">
                <Spinner size="small" label={`Approving ${progress.current} of ${progress.total}…`} />
                <ProgressBar
                  value={progress.current}
                  max={progress.total}
                  thickness="medium"
                />
                <Text size={200}>
                  Please wait — do not close this window until approval completes.
                </Text>
              </div>
            )}

            {isDone && result && (
              <div className={styles.statusBlock}>
                {result.status === "success" ? (
                  <MessageBar intent="success" icon={<CheckmarkCircle24Regular />}>
                    <MessageBarBody>
                      <MessageBarTitle>Success</MessageBarTitle>
                      {bulkResultMessage(result, "check-out request")}
                    </MessageBarBody>
                  </MessageBar>
                ) : (
                  <MessageBar intent="error">
                    <MessageBarBody>
                      <MessageBarTitle>
                        {result.status === "partial" ? "Partially completed" : "Approval failed"}
                      </MessageBarTitle>
                      {bulkResultMessage(result, "check-out request")}
                      {result.errorMessage && (
                        <Text block style={{ marginTop: tokens.spacingVerticalXS }}>
                          {result.errorMessage}
                        </Text>
                      )}
                      {canRetry && (
                        <Text block style={{ marginTop: tokens.spacingVerticalXS }}>
                          You can retry the failed request{result.failedCount === 1 ? "" : "s"} or close and review them in the queue.
                        </Text>
                      )}
                    </MessageBarBody>
                  </MessageBar>
                )}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            {!isDone && (
              <>
                <Button appearance="secondary" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button appearance="primary" onClick={onConfirm} disabled={isSubmitting}>
                  {isSubmitting
                    ? <Spinner size="tiny" label="Approving…" />
                    : `Approve all (${totalRows})`}
                </Button>
              </>
            )}
            {isDone && (
              <>
                {canRetry && (
                  <Button appearance="primary" icon={<ArrowClockwise24Regular />} onClick={onRetry}>
                    Retry failed ({result.failedCount})
                  </Button>
                )}
                <Button appearance={canRetry ? "secondary" : "primary"} onClick={onClose}>
                  {result?.status === "success" ? "Done" : "Close"}
                </Button>
              </>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
