import { Button, Spinner, Text, tokens, makeStyles } from "@fluentui/react-components";
import { ArrowDownload24Regular } from "@fluentui/react-icons";
import { useCheckOut } from "../hooks/useCheckOut";
import { useAppConfig } from "../../../config/useAppConfig";

const useStyles = makeStyles({
  error: {
    display: "block",
    marginTop: tokens.spacingVerticalXS,
    color: tokens.colorPaletteRedForeground1,
  },
});

interface Props {
  drawingId: string;
}

export function CheckOutButton({ drawingId }: Props) {
  const styles = useStyles();
  const { RequireCheckOutApproval } = useAppConfig();
  const mutation = useCheckOut();
  // WS3: when Check Out is gated, the action files a request for approval rather than
  // checking the drawing out immediately.
  const label = RequireCheckOutApproval ? "Request Check Out" : "Check Out";

  return (
    <div>
      <Button
        appearance="primary"
        icon={mutation.isPending ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
        disabled={mutation.isPending}
        onClick={() => mutation.mutate(drawingId)}
      >
        {mutation.isPending ? (RequireCheckOutApproval ? "Requesting…" : "Checking out…") : label}
      </Button>
      {mutation.isError && (
        <Text className={styles.error} size={200}>
          {mutation.error?.message ?? "Check Out failed. Try again."}
        </Text>
      )}
    </div>
  );
}
