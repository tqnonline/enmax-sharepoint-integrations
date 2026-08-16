import {
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Button, Badge, Text, Spinner, tokens, makeStyles,
} from "@fluentui/react-components";
import { Checkmark20Regular, Dismiss20Regular, Pin16Filled } from "@fluentui/react-icons";
import type { HomeBroadcast } from "./useHomeData";
import { useDismissBroadcast } from "./useHomeData";
import { broadcastSeverityIntent, type SeverityIntent } from "./homeUtils";
import { SEVERITY_LABEL } from "../broadcasts/broadcastUtils";

const SEV_BADGE: Record<SeverityIntent, "informative" | "warning" | "danger" | "success"> = {
  info: "informative", warning: "warning", error: "danger", success: "success",
};

const useStyles = makeStyles({
  meta: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, marginBottom: tokens.spacingVerticalM },
  body: {
    whiteSpace: "pre-wrap",
    color: tokens.colorNeutralForeground1,
    lineHeight: tokens.lineHeightBase400,
  },
  pinnedNote: {
    display: "block",
    marginTop: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground3,
  },
});

interface Props {
  broadcast: HomeBroadcast | null;
  open: boolean;
  onClose: () => void;
}

/** Full-content reader for a broadcast. Non-pinned broadcasts can be Acknowledged (ack-required) or
 *  Dismissed, which writes a BroadcastDismissal row and removes them from Home. Pinned broadcasts are
 *  sticky — they offer only Close and stay until they expire. */
export function BroadcastDetailDialog({ broadcast, open, onClose }: Props) {
  const styles = useStyles();
  const dismiss = useDismissBroadcast();
  const intent = broadcastSeverityIntent(broadcast?.severity);
  const pinned = broadcast?.pinned ?? false;

  function act(acknowledged: boolean) {
    if (!broadcast) return;
    dismiss.mutate({ broadcastId: broadcast.id, acknowledged }, { onSuccess: onClose });
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{broadcast?.title}</DialogTitle>
          <DialogContent>
            <div className={styles.meta}>
              <Badge appearance="tint" color={SEV_BADGE[intent]} shape="rounded">
                {SEVERITY_LABEL[broadcast?.severity ?? 1] ?? "Info"}
              </Badge>
              {pinned && (
                <Badge appearance="tint" color="brand" shape="rounded" icon={<Pin16Filled />}>Pinned</Badge>
              )}
              {!pinned && broadcast?.requiresAck && (
                <Badge appearance="outline" color="important" shape="rounded">Acknowledgement required</Badge>
              )}
            </div>
            <Text as="p" className={styles.body}>{broadcast?.body}</Text>
            {pinned && (
              <Text size={200} className={styles.pinnedNote}>
                This is a pinned notice — it stays on your Home until it expires.
              </Text>
            )}
          </DialogContent>
          <DialogActions>
            {!pinned && (
              broadcast?.requiresAck ? (
                <Button
                  appearance="primary"
                  icon={dismiss.isPending ? <Spinner size="tiny" /> : <Checkmark20Regular />}
                  disabled={dismiss.isPending}
                  onClick={() => act(true)}
                >
                  Acknowledge
                </Button>
              ) : (
                <Button
                  appearance="primary"
                  icon={dismiss.isPending ? <Spinner size="tiny" /> : <Dismiss20Regular />}
                  disabled={dismiss.isPending}
                  onClick={() => act(false)}
                >
                  Dismiss
                </Button>
              )
            )}
            <Button appearance="secondary" onClick={onClose} disabled={dismiss.isPending}>Close</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
