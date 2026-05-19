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
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import type { PendingReservation } from "./hooks/usePendingReservations";

const useStyles = makeStyles({
  list: { listStyle: "none", padding: 0, margin: 0 },
  item: {
    display: "flex",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalXS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

interface Props {
  open: boolean;
  reservations: PendingReservation[];
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}

export function BulkApproveDialog({ open, reservations, onClose, onConfirm, isSubmitting }: Props) {
  const styles = useStyles();

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogTitle>Approve {reservations.length} reservation(s)?</DialogTitle>
        <DialogBody>
          <DialogContent>
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
            <Text style={{ marginTop: "1rem", display: "block" }}>
              Each reservation will be approved sequentially. Numbers are issued at approval.
            </Text>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button appearance="primary" onClick={onConfirm} disabled={isSubmitting}>
              {isSubmitting ? <Spinner size="tiny" label="Approving…" /> : `Approve all (${reservations.length})`}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
