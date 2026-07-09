import { useCallback, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Spinner,
  Text,
  Toast,
  ToastTitle,
  Tooltip,
  useToastController,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { Document16Regular, ArrowSquareUpRightRegular, Info16Regular } from "@fluentui/react-icons";
import { sharePointFileUrl } from "../../sharepoint/sharepointUrls";
import { useCheckOutSheets } from "../hooks/useCheckOutSheets";
import { CheckoutStatus } from "../api/checkoutClient";
import {
  useDrawingSheets,
  SHEET_STATE_AVAILABLE,
  SHEET_STATE_LABELS,
  NEW_SHEET_DAYS,
} from "../../approvals/hooks/useDrawingSheets";
import { useSheetCheckouts } from "../../approvals/hooks/useSheetCheckouts";
import type { SheetCheckoutInfo } from "../../approvals/hooks/useSheetCheckouts";
import { useAppConfig } from "../../../config/useAppConfig";
import { formatGridDateTime } from "../../../lib/formatDateTime";
import {
  checkoutBulkLabel,
  checkoutSelectedLabel,
  checkoutSingleLabel,
  documentDisplayNumber,
} from "../../reserve/terminology";

type BadgeColor = "success" | "warning" | "informative" | "subtle" | "danger";

const useStyles = makeStyles({
  sheetSummary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    marginBottom: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  sheetTableHeader: {
    display: "grid",
    gridTemplateColumns: "36px minmax(180px, 1.2fr) minmax(120px, 0.8fr) minmax(160px, 1fr) minmax(160px, 1fr) 40px minmax(140px, auto)",
    gap: tokens.spacingHorizontalS,
    alignItems: "center",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}`,
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  sheetRow: {
    display: "grid",
    gridTemplateColumns: "36px minmax(180px, 1.2fr) minmax(120px, 0.8fr) minmax(160px, 1fr) minmax(160px, 1fr) 40px minmax(140px, auto)",
    gap: tokens.spacingHorizontalS,
    alignItems: "center",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXS}`,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  sheetNumber: {
    color: tokens.colorNeutralForeground1,
    flexShrink: 0,
    fontFamily: tokens.fontFamilyMonospace,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  sheetMeta: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  sheetMetaMuted: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  sheetActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: tokens.spacingHorizontalXS,
    flexWrap: "nowrap",
  },
  newBadgeWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
  },
});

function isRecentlyCreated(createdOn?: string): boolean {
  if (!createdOn) return false;
  const ageMs = Date.now() - new Date(createdOn).getTime();
  return ageMs >= 0 && ageMs <= NEW_SHEET_DAYS * 24 * 60 * 60 * 1000;
}

function isAppendSheet(sheetNumber: number | undefined, appendFirst?: number, appendLast?: number): boolean {
  return appendFirst != null && appendLast != null && sheetNumber != null
    && sheetNumber >= appendFirst && sheetNumber <= appendLast;
}

function newSheetTooltip(createdOn?: string, fromAppend?: boolean): string {
  if (fromAppend) return "Added as part of this reservation.";
  if (isRecentlyCreated(createdOn)) {
    return `Created within the last ${NEW_SHEET_DAYS} days.`;
  }
  return "Recently added.";
}

function sheetStatusBadge(
  sheetState?: number,
  checkout?: SheetCheckoutInfo,
): { label: string; color: BadgeColor } {
  if (checkout?.status === CheckoutStatus.Requested) {
    return { label: "Pending Approval", color: "warning" };
  }
  if (checkout?.status === CheckoutStatus.Open) {
    return { label: "Checked out", color: "warning" };
  }
  if (checkout?.status === CheckoutStatus.AwaitingValidation) {
    return { label: "Awaiting validation", color: "informative" };
  }
  const label = SHEET_STATE_LABELS[sheetState ?? 0] ?? "Unknown";
  if (sheetState === SHEET_STATE_AVAILABLE) return { label, color: "success" };
  if (sheetState === 3) return { label, color: "warning" };
  if (sheetState === 4) return { label, color: "informative" };
  return { label, color: "subtle" };
}

function canRequestCheckout(
  sheetState?: number,
  checkout?: SheetCheckoutInfo,
): boolean {
  if (sheetState !== SHEET_STATE_AVAILABLE) return false;
  if (!checkout) return true;
  return checkout.status !== CheckoutStatus.Requested
    && checkout.status !== CheckoutStatus.Open
    && checkout.status !== CheckoutStatus.AwaitingValidation;
}

function formatActorDate(name?: string, iso?: string): string {
  if (!name && !iso) return "—";
  if (name && iso) return `${name} · ${formatGridDateTime(iso)}`;
  return name ?? formatGridDateTime(iso);
}

export interface DrawingSheetListProps {
  drawingId: string;
  baseNumber?: string;
  reservationType?: number;
  documentSubtype?: number;
  checkoutEnabled: boolean;
  childNoun: string;
  appendFirst?: number;
  appendLast?: number;
  toasterId: string;
}

export function DrawingSheetList({
  drawingId,
  baseNumber,
  reservationType,
  documentSubtype,
  checkoutEnabled,
  childNoun,
  appendFirst,
  appendLast,
  toasterId,
}: DrawingSheetListProps) {
  const styles = useStyles();
  const { RequireCheckOutApproval } = useAppConfig();
  const requireApproval = RequireCheckOutApproval ?? true;
  const { dispatchToast } = useToastController(toasterId);
  const { data: sheets, isPending } = useDrawingSheets(drawingId, true);
  const { data: checkoutMap } = useSheetCheckouts(drawingId, true);
  const checkOutSheets = useCheckOutSheets();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const childPlural = `${childNoun.toLowerCase()}s`;
  const childLabel = childNoun.toLowerCase();

  const selectableIds = useMemo(() => {
    if (!sheets || !checkoutEnabled) return new Set<string>();
    return new Set(
      sheets
        .filter((s) => canRequestCheckout(s.state, checkoutMap?.get(s.id)))
        .map((s) => s.id),
    );
  }, [sheets, checkoutEnabled, checkoutMap]);

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

  const runCheckout = useCallback((sheetIds: string[], allAvailable = false) => {
    checkOutSheets.mutate(
      allAvailable ? { drawingId, allAvailable: true } : { drawingId, sheetIds },
      {
        onSuccess: () => {
          setSelected(new Set());
          const count = allAvailable ? selectableIds.size : sheetIds.length;
          dispatchToast(
            <Toast>
              <ToastTitle>
                {requireApproval
                  ? `Check Out request submitted for ${count} ${count === 1 ? childLabel : childPlural}. Pending approval.`
                  : `${count} ${count === 1 ? childLabel : childPlural} checked out.`}
              </ToastTitle>
            </Toast>,
            { intent: "success" },
          );
        },
        onError: (err) => {
          dispatchToast(
            <Toast>
              <ToastTitle>{err instanceof Error ? err.message : "Check Out request failed."}</ToastTitle>
            </Toast>,
            { intent: "error" },
          );
        },
      },
    );
  }, [checkOutSheets, drawingId, dispatchToast, requireApproval, childLabel, childPlural, selectableIds.size]);

  if (isPending) {
    return <Spinner size="tiny" label={`Loading ${childPlural}…`} style={{ margin: tokens.spacingVerticalS }} />;
  }
  if (!sheets || sheets.length === 0) {
    return <Text size={200} className={styles.sheetMetaMuted}>No {childPlural} found.</Text>;
  }

  const allSelected = selectableIds.size > 0 && [...selectableIds].every((id) => selected.has(id));

  return (
    <>
      <div className={styles.sheetSummary}>
        <Text size={200} className={styles.sheetMetaMuted}>
          {sheets.length} {sheets.length === 1 ? childLabel : childPlural}
        </Text>
        {checkoutEnabled && selectableIds.size > 0 && (
          <div className={styles.sheetActions}>
            <Checkbox
              label={`Select all available (${selectableIds.size})`}
              checked={allSelected}
              onChange={(_, d) => toggleAll(!!d.checked)}
            />
            <Button
              appearance="secondary"
              size="small"
              disabled={checkOutSheets.isPending}
              onClick={() => runCheckout([], true)}
            >
              {checkOutSheets.isPending
                ? "Submitting…"
                : checkoutBulkLabel(reservationType, documentSubtype, childNoun, requireApproval)}
            </Button>
            {selected.size > 0 && (
              <Button
                appearance="primary"
                size="small"
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

      <div className={styles.sheetTableHeader} role="row">
        {checkoutEnabled && <span aria-hidden />}
        <span>{childNoun} #</span>
        <span>Status</span>
        <span>Last checked out</span>
        <span>Last checked in</span>
        <span>SharePoint</span>
        <span style={{ textAlign: "right" }}>Action</span>
      </div>

      {sheets.map((sheet) => {
        const checkout = checkoutMap?.get(sheet.id);
        const status = sheetStatusBadge(sheet.state, checkout);
        const displayNum = documentDisplayNumber(
          baseNumber, sheet.sheetNumber, reservationType, documentSubtype,
        );
        const fromAppend = isAppendSheet(sheet.sheetNumber, appendFirst, appendLast);
        const showNew = fromAppend || isRecentlyCreated(sheet.createdOn);
        const requestable = canRequestCheckout(sheet.state, checkout);
        const checkedOutLine = checkout?.checkedOutOn || checkout?.checkedOutByName
          ? formatActorDate(checkout.checkedOutByName, checkout.checkedOutOn ?? checkout.requestedOn)
          : "—";
        const checkedInLine = checkout?.closedOn || checkout?.closedByName
          ? formatActorDate(checkout.closedByName, checkout.closedOn)
          : "—";
        const sheetSpUrl = sharePointFileUrl(sheet.sharepointUrl, sheet.destinationUrl);

        return (
          <div key={sheet.id} className={styles.sheetRow} role="row">
            {checkoutEnabled ? (
              <Checkbox
                aria-label={`Select ${displayNum}`}
                checked={selected.has(sheet.id)}
                disabled={!requestable || checkOutSheets.isPending}
                onChange={(_, d) => toggleOne(sheet.id, !!d.checked)}
              />
            ) : (
              <span aria-hidden />
            )}
            <div>
              <Text size={200} className={styles.sheetNumber} title={displayNum}>
                <Document16Regular style={{ marginRight: 6, verticalAlign: "middle", color: tokens.colorNeutralForeground3 }} />
                {displayNum}
              </Text>
              {sheet.filename && (
                <Text block size={100} className={styles.sheetMetaMuted} title={sheet.filename}>
                  {sheet.filename}
                </Text>
              )}
              {showNew && (
                <span className={styles.newBadgeWrap}>
                  <Badge appearance="filled" color="success" size="small">New</Badge>
                  <Tooltip content={newSheetTooltip(sheet.createdOn, fromAppend)} relationship="label">
                    <Info16Regular aria-label="Why is this marked new?" style={{ color: tokens.colorNeutralForeground3 }} />
                  </Tooltip>
                </span>
              )}
            </div>
            <Badge appearance="tint" color={status.color} size="small">{status.label}</Badge>
            <Text size={200} className={styles.sheetMeta} title={checkedOutLine}>{checkedOutLine}</Text>
            <Text size={200} className={styles.sheetMeta} title={checkedInLine}>{checkedInLine}</Text>
            <div>
              {sheetSpUrl ? (
                <Tooltip content="Open in SharePoint" relationship="label">
                  <Button
                    as="a"
                    href={sheetSpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    appearance="subtle"
                    icon={<ArrowSquareUpRightRegular />}
                    size="small"
                    aria-label={`Open ${displayNum} in SharePoint`}
                  />
                </Tooltip>
              ) : (
                <Text size={100} className={styles.sheetMetaMuted}>—</Text>
              )}
            </div>
            <div className={styles.sheetActions}>
              {checkoutEnabled && requestable && (
                <Button
                  appearance="secondary"
                  size="small"
                  disabled={checkOutSheets.isPending}
                  onClick={() => runCheckout([sheet.id])}
                >
                  {checkOutSheets.isPending ? "Submitting…" : checkoutSingleLabel(requireApproval)}
                </Button>
              )}
              {checkoutEnabled && checkout?.status === CheckoutStatus.Requested && (
                <Text size={100} className={styles.sheetMetaMuted}>Pending approval</Text>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
