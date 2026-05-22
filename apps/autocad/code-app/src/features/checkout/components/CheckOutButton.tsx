import { Button, Spinner, Text, tokens, makeStyles } from "@fluentui/react-components";
import { ArrowDownload24Regular } from "@fluentui/react-icons";
import { useCheckOut } from "../hooks/useCheckOut";

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
  const mutation = useCheckOut();

  return (
    <div>
      <Button
        appearance="primary"
        icon={mutation.isPending ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
        disabled={mutation.isPending}
        onClick={() => mutation.mutate(drawingId)}
      >
        Check Out
      </Button>
      {mutation.isError && (
        <Text className={styles.error} size={200}>
          {mutation.error?.message ?? "Check-out failed. Try again."}
        </Text>
      )}
    </div>
  );
}
