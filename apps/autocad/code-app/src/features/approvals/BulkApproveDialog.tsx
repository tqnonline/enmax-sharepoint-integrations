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
import type { PendingReservation } from "./hooks/usePendingReservations";
import { bulkResultMessage, type BulkActionResult } from "./bulkActionResult";

const useStyles = makeStyles({
  list: { listStyle: "none", padding: 0, margin: 0, maxHeight: "240px", overflowY: "auto" },
  item: {
    display: "flex",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalXS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
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

interface Props {
  open: boolean;
  reservations: PendingReservation[];
  onClose: () => void;
  onConfirm: () => void;
  onRetry?: () => void;
  isSubmitting: boolean;
  progress?: { current: number; total: number } | null;
  result?: BulkActionResult;
}

export function BulkApproveDialog({
  open,
  reservations,
  onClose,
  onConfirm,
  onRetry,
  isSubmitting,
  progress,
  result,
}: Props) {
  const styles = useStyles();
  const isDone = result != null && !isSubmitting;
  const canRetry = isDone && result.failedCount > 0 && onRetry;

  const title = isSubmitting
    ? "Approving reservations…"
    : result?.status === "success"
      ? "Reservations approved"
      : result
        ? "Some reservations could not be approved"
        : `Approve ${reservations.length} reservation(s)?`;

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open && !isSubmitting) onClose(); }}>
      <DialogSurface>
        <DialogTitle>{title}</DialogTitle>
        <DialogBody>
          <DialogContent>
            {!isDone && (
              <>
                <ul className={styles.list}>
                  {reservations.map((r) => (
                    <li key={r.enmax_acdnreservationid} className={styles.item}>
                      <Text>{r.enmax_acdnreservationnumber}</Text>
                      <Text>{r._createdby_value_Formatted}</Text>
                      <Text>
                        {r.businessCode}-{r.assetCode}-{r.unitCode}-{r.domainCode}-{r.systemCode}-{r.kindCode}-????
                      </Text>
                    </li>
                  ))}
                </ul>
                {!isSubmitting && (
                  <Text style={{ marginTop: "1rem", display: "block" }}>
                    Each reservation will be approved sequentially. Numbers are issued at approval.
                  </Text>
                )}
              </>
            )}

            {isSubmitting && progress && (
              <div className={styles.progressBlock} role="status" aria-live="polite">
                <Spinner size="small" label={`Approving ${progress.current} of ${progress.total}…`} />
                <ProgressBar value={progress.current} max={progress.total} thickness="medium" />
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
                      {bulkResultMessage(result, "reservation")}
                    </MessageBarBody>
                  </MessageBar>
                ) : (
                  <MessageBar intent="error">
                    <MessageBarBody>
                      <MessageBarTitle>
                        {result.status === "partial" ? "Partially completed" : "Approval failed"}
                      </MessageBarTitle>
                      {bulkResultMessage(result, "reservation")}
                      {result.errorMessage && (
                        <Text block style={{ marginTop: tokens.spacingVerticalXS }}>
                          {result.errorMessage}
                        </Text>
                      )}
                      {canRetry && (
                        <Text block style={{ marginTop: tokens.spacingVerticalXS }}>
                          You can retry the failed reservation{result.failedCount === 1 ? "" : "s"} or close and review them in the queue.
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
                    : `Approve all (${reservations.length})`}
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
