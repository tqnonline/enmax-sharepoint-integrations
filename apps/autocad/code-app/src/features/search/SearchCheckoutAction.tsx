import { Button, Spinner, Text, tokens, makeStyles } from "@fluentui/react-components";
import { ArrowDownload24Regular } from "@fluentui/react-icons";
import { useAppConfig } from "../../config/useAppConfig";
import { useCheckOut } from "../checkout/hooks/useCheckOut";
import { useCheckOutSheets } from "../checkout/hooks/useCheckOutSheets";
import { DrawingState } from "../checkout/api/checkoutClient";
import type { SearchDocumentRow } from "./useSearchDocuments";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: tokens.spacingVerticalXXS,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
    maxWidth: "160px",
    textAlign: "right",
  },
});

interface Props {
  row: SearchDocumentRow;
}

export function SearchCheckoutAction({ row }: Props) {
  const styles = useStyles();
  const { RequireCheckOutApproval } = useAppConfig();
  const checkOut = useCheckOut();
  const checkOutSheets = useCheckOutSheets();

  if (row.state !== DrawingState.Available) return null;

  const pending = checkOut.isPending || checkOutSheets.isPending;
  const error = checkOut.error ?? checkOutSheets.error;
  const label = RequireCheckOutApproval ? "Request Check Out" : "Check Out";

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (row.isChildDocument) {
      checkOutSheets.mutate({ drawingId: row.drawingId, sheetIds: [row.id] });
    } else {
      checkOut.mutate(row.drawingId);
    }
  }

  return (
    <div className={styles.root}>
      <Button
        appearance="primary"
        size="small"
        icon={pending ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
        disabled={pending}
        onClick={handleClick}
      >
        {pending ? "Requesting…" : label}
      </Button>
      {error && (
        <Text size={100} className={styles.error}>
          {error.message}
        </Text>
      )}
    </div>
  );
}
