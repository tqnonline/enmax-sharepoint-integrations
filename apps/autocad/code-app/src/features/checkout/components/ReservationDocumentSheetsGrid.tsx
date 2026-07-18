import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Link,
  Spinner,
  Text,
  Toast,
  ToastTitle,
  useToastController,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { ArrowDownload24Regular, ArrowSortDownRegular, ArrowSortUpRegular } from "@fluentui/react-icons";
import { sharePointFileUrl } from "../../sharepoint/sharepointUrls";
import { useCheckOutSheets } from "../hooks/useCheckOutSheets";
import { CheckoutStatus } from "../api/checkoutClient";
import {
  SHEET_STATE_AVAILABLE,
  NEW_SHEET_DAYS,
} from "../../approvals/hooks/useDrawingSheets";
import type { SheetCheckoutInfo } from "../../approvals/hooks/useSheetCheckouts";
import {
  useReservationSheets,
  type ReservationSheetRow,
} from "../../approvals/hooks/useReservationSheets";
import { useAppConfig } from "../../../config/useAppConfig";
import { SheetStatusBadge } from "./SheetStatusBadge";
import { sheetStatusPresentation } from "./sheetStatusPresentation";
import {
  checkoutBulkLabel,
  checkoutSelectedLabel,
  checkoutSingleLabel,
  documentDisplayNumber,
  reservationChildNoun,
  reservationChildNounPlural,
  reservationChildNounPluralLower,
} from "../../reserve/terminology";

type SortCol = "number" | "status" | "checkedOutTo" | "sharePoint";
type SortDir = "asc" | "desc";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  summary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
  bulkActions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  thSortable: {
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  thSortIcon: {
    marginLeft: tokens.spacingHorizontalXS,
    verticalAlign: "middle",
  },
  td: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: "middle",
  },
  tdStatus: {
    whiteSpace: "nowrap",
    width: "1%",
  },
  mono: {
    fontFamily: tokens.fontFamilyMonospace,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: tokens.spacingHorizontalXS,
  },
});

function canRequestCheckout(
  sheetState: number | undefined,
  checkout: SheetCheckoutInfo | undefined,
): boolean {
  if (checkout?.status === CheckoutStatus.Requested
    || checkout?.status === CheckoutStatus.Open
    || checkout?.status === CheckoutStatus.AwaitingValidation) {
    return false;
  }
  return sheetState === SHEET_STATE_AVAILABLE || sheetState == null;
}

function isRecentlyCreated(createdOn?: string): boolean {
  if (!createdOn) return false;
  const created = new Date(createdOn).getTime();
  return Date.now() - created < NEW_SHEET_DAYS * 24 * 60 * 60 * 1000;
}

function checkedOutToName(checkout?: SheetCheckoutInfo): string {
  if (!checkout) return "";
  if (
    checkout.status === CheckoutStatus.Open
    || checkout.status === CheckoutStatus.Requested
    || checkout.status === CheckoutStatus.AwaitingValidation
  ) {
    return checkout.checkedOutByName?.trim() || "";
  }
  return "";
}

function sheetSortValue(
  sheet: ReservationSheetRow,
  col: SortCol,
  reservationType?: number,
  documentSubtype?: number,
): string {
  switch (col) {
    case "number":
      return documentDisplayNumber(
        sheet.drawingNumber,
        sheet.sheetNumber,
        reservationType,
        documentSubtype,
      ).toLowerCase();
    case "status":
      return sheetStatusPresentation(sheet.state, sheet.checkout).label.toLowerCase();
    case "checkedOutTo":
      return checkedOutToName(sheet.checkout).toLowerCase();
    case "sharePoint": {
      const preferDropOff = sheet.checkout?.status === CheckoutStatus.Open;
      return (sharePointFileUrl(sheet.sharepointUrl, sheet.destinationUrl, { preferDropOff }) ?? "").toLowerCase();
    }
    default:
      return "";
  }
}

interface Props {
  drawings: { id: string; number?: string }[];
  reservationType?: number;
  documentSubtype?: number;
  checkoutEnabled: boolean;
  appendFirst?: number;
  appendLast?: number;
  toasterId: string;
  /** Notifies parent of loaded sheet IDs (for reservation activity trail). */
  onSheetIdsChange?: (sheetIds: string[]) => void;
}

export function ReservationDocumentSheetsGrid({
  drawings,
  reservationType,
  documentSubtype,
  checkoutEnabled,
  appendFirst,
  appendLast,
  toasterId,
  onSheetIdsChange,
}: Props) {
  const styles = useStyles();
  const { RequireCheckOutApproval } = useAppConfig();
  const requireApproval = RequireCheckOutApproval ?? true;
  const { dispatchToast } = useToastController(toasterId);
  const sheetsQuery = useReservationSheets(drawings, drawings.length > 0);
  const checkOutSheets = useCheckOutSheets();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<SortCol>("number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sheets = sheetsQuery.data ?? [];
  const childNoun = reservationChildNoun(reservationType, documentSubtype);
  const childPlural = reservationChildNounPlural(reservationType, documentSubtype);
  const childPluralLower = reservationChildNounPluralLower(reservationType, documentSubtype);

  useEffect(() => {
    onSheetIdsChange?.(sheets.map((s) => s.id));
  }, [sheets, onSheetIdsChange]);

  const sortedSheets = useMemo(() => {
    const rows = [...sheets];
    rows.sort((a, b) => {
      const av = sheetSortValue(a, sortCol, reservationType, documentSubtype);
      const bv = sheetSortValue(b, sortCol, reservationType, documentSubtype);
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [sheets, sortCol, sortDir, reservationType, documentSubtype]);

  const handleSort = useCallback((col: SortCol) => {
    setSortCol((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return col;
    });
  }, []);

  const sortableHeader = (col: SortCol, label: string) => (
    <th
      className={`${styles.th} ${styles.thSortable}`}
      onClick={() => handleSort(col)}
      aria-sort={sortCol === col ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      {sortCol === col && (
        <span className={styles.thSortIcon} aria-hidden>
          {sortDir === "asc" ? <ArrowSortUpRegular /> : <ArrowSortDownRegular />}
        </span>
      )}
    </th>
  );

  const selectableIds = useMemo(() => {
    if (!checkoutEnabled) return new Set<string>();
    return new Set(
      sheets.filter((s) => canRequestCheckout(s.state, s.checkout)).map((s) => s.id),
    );
  }, [sheets, checkoutEnabled]);

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((checked: boolean) => {
    setSelected(checked ? new Set(selectableIds) : new Set());
  }, [selectableIds]);

  const runCheckout = useCallback((sheetIds: string[]) => {
    if (sheetIds.length === 0) return;
    const first = sheets.find((s) => s.id === sheetIds[0]);
    const drawingId = first?.drawingId ?? drawings[0]?.id ?? "";
    checkOutSheets.mutate(
      { drawingId, sheetIds },
      {
        onSuccess: () => {
          setSelected(new Set());
          void sheetsQuery.refetch();
          dispatchToast(
            <Toast>
              <ToastTitle>
                {requireApproval
                  ? `Check Out request submitted for ${sheetIds.length} ${sheetIds.length === 1 ? "item" : childPluralLower}. Pending approval.`
                  : `${sheetIds.length} ${sheetIds.length === 1 ? "item" : childPluralLower} checked out.`}
              </ToastTitle>
            </Toast>,
            { intent: "success" },
          );
        },
        onError: (err) => {
          dispatchToast(
            <Toast>
              <ToastTitle>{(err as Error).message}</ToastTitle>
            </Toast>,
            { intent: "error" },
          );
        },
      },
    );
  }, [
    sheets,
    drawings,
    checkOutSheets,
    sheetsQuery,
    dispatchToast,
    requireApproval,
    childPluralLower,
  ]);

  if (sheetsQuery.isPending) {
    return <Spinner label={`Loading ${childPluralLower}…`} size="small" />;
  }

  if (sheets.length === 0) {
    return <Text className={styles.muted}>No {childPluralLower} found.</Text>;
  }

  const allSelected = selectableIds.size > 0 && [...selectableIds].every((id) => selected.has(id));

  return (
    <div className={styles.root}>
      <div className={styles.summary}>
        <Text weight="semibold">
          {sheets.length} {sheets.length === 1 ? childNoun : childPlural}
        </Text>
        {checkoutEnabled && selectableIds.size > 0 && (
          <div className={styles.bulkActions}>
            <Checkbox
              label={`Select all available (${selectableIds.size})`}
              checked={allSelected}
              onChange={(_, d) => toggleAll(!!d.checked)}
            />
            <Button
              appearance="secondary"
              icon={checkOutSheets.isPending ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
              disabled={checkOutSheets.isPending}
              onClick={() => runCheckout([...selectableIds])}
            >
              {checkOutSheets.isPending
                ? "Submitting…"
                : checkoutBulkLabel(reservationType, documentSubtype, undefined, requireApproval)}
            </Button>
            {selected.size > 0 && (
              <Button
                appearance="primary"
                icon={checkOutSheets.isPending ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
                disabled={checkOutSheets.isPending}
                onClick={() => runCheckout([...selected])}
              >
                {checkOutSheets.isPending
                  ? "Submitting…"
                  : checkoutSelectedLabel(selected.size, requireApproval)}
              </Button>
            )}
          </div>
        )}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            {checkoutEnabled && <th className={styles.th}>Select</th>}
            {sortableHeader("number", `${childNoun} #`)}
            {sortableHeader("status", "Status")}
            {checkoutEnabled && sortableHeader("checkedOutTo", "Checked Out To")}
            {sortableHeader("sharePoint", "Published File in SharePoint")}
            {checkoutEnabled && <th className={styles.th} style={{ textAlign: "right" }}>Action</th>}
          </tr>
        </thead>
        <tbody>
          {sortedSheets.map((sheet) => (
            <SheetRow
              key={sheet.id}
              sheet={sheet}
              styles={styles}
              checkoutEnabled={checkoutEnabled}
              reservationType={reservationType}
              documentSubtype={documentSubtype}
              appendFirst={appendFirst}
              appendLast={appendLast}
              selected={selected.has(sheet.id)}
              requestable={canRequestCheckout(sheet.state, sheet.checkout)}
              pending={checkOutSheets.isPending}
              requireApproval={requireApproval}
              onToggle={toggleOne}
              onCheckout={(id) => runCheckout([id])}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SheetRow({
  sheet,
  styles,
  checkoutEnabled,
  reservationType,
  documentSubtype,
  appendFirst,
  appendLast,
  selected,
  requestable,
  pending,
  requireApproval,
  onToggle,
  onCheckout,
}: {
  sheet: ReservationSheetRow;
  styles: ReturnType<typeof useStyles>;
  checkoutEnabled: boolean;
  reservationType?: number;
  documentSubtype?: number;
  appendFirst?: number;
  appendLast?: number;
  selected: boolean;
  requestable: boolean;
  pending: boolean;
  requireApproval: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onCheckout: (id: string) => void;
}) {
  const displayNum = documentDisplayNumber(
    sheet.drawingNumber,
    sheet.sheetNumber,
    reservationType,
    documentSubtype,
  );
  const fromAppend = sheet.sheetNumber != null
    && appendFirst != null
    && appendLast != null
    && sheet.sheetNumber >= appendFirst
    && sheet.sheetNumber <= appendLast;
  const showNew = fromAppend || isRecentlyCreated(sheet.createdOn);
  const owner = checkedOutToName(sheet.checkout);
  const preferDropOff = sheet.checkout?.status === CheckoutStatus.Open;
  const spUrl = sharePointFileUrl(sheet.sharepointUrl, sheet.destinationUrl, { preferDropOff });

  return (
    <tr>
      {checkoutEnabled && (
        <td className={styles.td}>
          <Checkbox
            aria-label={`Select ${displayNum}`}
            checked={selected}
            disabled={!requestable || pending}
            onChange={(_, d) => onToggle(sheet.id, !!d.checked)}
          />
        </td>
      )}
      <td className={styles.td}>
        <Text className={styles.mono} weight="semibold">{displayNum}</Text>
        {showNew && (
          <Badge appearance="filled" color="success" size="small" style={{ marginLeft: 8 }}>
            New
          </Badge>
        )}
      </td>
      <td className={`${styles.td} ${styles.tdStatus}`}>
        <SheetStatusBadge sheetState={sheet.state} checkout={sheet.checkout} />
      </td>
      {checkoutEnabled && (
        <td className={styles.td}>
          <Text>{owner || "—"}</Text>
        </td>
      )}
      <td className={styles.td}>
        {spUrl ? (
          <Link href={spUrl} target="_blank" rel="noopener noreferrer">
            <Text weight="semibold">Open in SharePoint</Text>
          </Link>
        ) : (
          <Text className={styles.muted}>—</Text>
        )}
      </td>
      {checkoutEnabled && (
        <td className={styles.td}>
          <div className={styles.actions}>
            {requestable && (
              <Button
                appearance="primary"
                size="small"
                icon={pending ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
                disabled={pending}
                onClick={() => onCheckout(sheet.id)}
              >
                {pending ? "…" : checkoutSingleLabel(requireApproval)}
              </Button>
            )}
            {sheet.checkout?.status === CheckoutStatus.Requested && (
              <Text size={100} className={styles.muted}>Pending approval</Text>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
