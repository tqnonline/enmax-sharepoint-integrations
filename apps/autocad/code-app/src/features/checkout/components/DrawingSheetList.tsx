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
  shorthands,
} from "@fluentui/react-components";
import {
  Document16Regular,
  Document20Regular,
  ArrowSquareUpRightRegular,
  Info16Regular,
  Info20Regular,
  ArrowDownload24Regular,
  History24Regular,
} from "@fluentui/react-icons";
import { preferSharePointDropOff, sharePointFileUrl } from "../../sharepoint/sharepointUrls";
import { useCheckOutSheets } from "../hooks/useCheckOutSheets";
import { CheckoutStatus } from "../api/checkoutClient";
import {
  useDrawingSheets,
  SHEET_STATE_AVAILABLE,
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
import { SheetStatusBadge } from "./SheetStatusBadge";
import { DocumentActivityTimeline } from "../../search/DocumentActivityTimeline";
import { useDrawingAuditTrail } from "../hooks/useDrawingAuditTrail";
import { reservationChildNounPluralLower } from "../../reserve/terminology";
import { useRetinaDisplay } from "../../../lib/useRetinaDisplay";
import {
  retinaGridMinWidth,
  retinaHairlineBorder,
  retinaScrollSurface,
} from "../../../styles/retinaDisplay";

const useStyles = makeStyles({
  wrap: {
    width: "100%",
    overflowX: "auto",
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...retinaScrollSurface,
  },
  sheetSummary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    marginBottom: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalS,
    ...retinaHairlineBorder("bottom"),
  },
  bulkActions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
  grid: retinaGridMinWidth,
  sheetTableHeader: {
    display: "grid",
    gridTemplateColumns: "44px minmax(220px, 1.4fr) minmax(140px, 0.9fr) minmax(180px, 1fr) minmax(180px, 1fr) 48px minmax(180px, auto)",
    gap: tokens.spacingHorizontalM,
    alignItems: "center",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    ...retinaHairlineBorder("bottom"),
    borderBottomWidth: "2px",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  sheetTableHeaderCompact: {
    display: "grid",
    gridTemplateColumns: "36px minmax(160px, 1.2fr) minmax(110px, 0.8fr) minmax(130px, 1fr) minmax(130px, 1fr) 40px minmax(120px, auto)",
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
    gridTemplateColumns: "44px minmax(220px, 1.4fr) minmax(140px, 0.9fr) minmax(180px, 1fr) minmax(180px, 1fr) 48px minmax(180px, auto)",
    gap: tokens.spacingHorizontalM,
    alignItems: "center",
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalS}`,
    ...retinaHairlineBorder("bottom"),
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  sheetRowCompact: {
    display: "grid",
    gridTemplateColumns: "36px minmax(160px, 1.2fr) minmax(110px, 0.8fr) minmax(130px, 1fr) minmax(130px, 1fr) 40px minmax(120px, auto)",
    gap: tokens.spacingHorizontalS,
    alignItems: "center",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXS}`,
    ...retinaHairlineBorder("bottom"),
  },
  sheetRowSelected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
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
    gap: tokens.spacingHorizontalS,
    flexWrap: "nowrap",
  },
  newBadgeWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
    marginTop: tokens.spacingVerticalXXS,
  },
  statusCell: {
    display: "flex",
    alignItems: "center",
    minWidth: 0,
  },
  activityPanel: {
    gridColumn: "1 / -1",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    marginTop: tokens.spacingVerticalXS,
  },
  clickableNumber: {
    cursor: "pointer",
    textDecoration: "underline",
    textDecorationColor: tokens.colorNeutralStroke2,
    ":hover": {
      color: tokens.colorBrandForeground1,
    },
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
  /** compact = drawer/flyout contexts; full = full-bleed detail pages */
  variant?: "compact" | "full";
  selectedSheetId?: string;
  onSheetClick?: (sheetId: string) => void;
  showPerRowActivity?: boolean;
}

function SheetActivityPanel({
  sheetId,
  drawingId,
  reservationType,
  documentSubtype,
}: {
  sheetId: string;
  drawingId: string;
  reservationType?: number;
  documentSubtype?: number;
}) {
  const { data: events = [] } = useDrawingAuditTrail([sheetId, drawingId]);
  return (
    <DocumentActivityTimeline
      events={events}
      reservationType={reservationType}
      documentSubtype={documentSubtype}
      title="Document activity"
      compact
    />
  );
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
  variant = "full",
  selectedSheetId,
  onSheetClick,
  showPerRowActivity = false,
}: DrawingSheetListProps) {
  const styles = useStyles();
  const isRetina = useRetinaDisplay();
  const DocIcon = isRetina ? Document20Regular : Document16Regular;
  const InfoIcon = isRetina ? Info20Regular : Info16Regular;
  const isFull = variant === "full";
  const { RequireCheckOutApproval } = useAppConfig();
  const requireApproval = RequireCheckOutApproval ?? true;
  const { dispatchToast } = useToastController(toasterId);
  const { data: sheets, isPending } = useDrawingSheets(drawingId, true);
  const { data: checkoutMap } = useSheetCheckouts(drawingId, true);
  const checkOutSheets = useCheckOutSheets();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedActivity, setExpandedActivity] = useState<Set<string>>(new Set());

  const childPlural = reservationChildNounPluralLower(reservationType, documentSubtype);
  const childLabel = childNoun.toLowerCase();
  const headerClass = isFull ? styles.sheetTableHeader : styles.sheetTableHeaderCompact;
  const rowClass = isFull ? styles.sheetRow : styles.sheetRowCompact;
  const buttonSize = isFull ? "medium" : "small";

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

  const toggleActivity = useCallback((id: string) => {
    setExpandedActivity((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

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
  const showCheckboxColumn = checkoutEnabled;

  return (
    <div className={styles.wrap}>
      <div className={styles.sheetSummary}>
        <Text size={isFull ? 300 : 200} weight="semibold">
          {sheets.length} {sheets.length === 1 ? childLabel : childPlural}
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
              size={buttonSize}
              icon={checkOutSheets.isPending ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
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
                size={buttonSize}
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

      <div className={styles.grid}>
        <div className={headerClass} role="row">
          {showCheckboxColumn && <span>Select</span>}
          {!showCheckboxColumn && <span aria-hidden />}
          <span>{childNoun} #</span>
          <span>Status</span>
          <span>Last checked out</span>
          <span>Last checked in</span>
          <span>SharePoint</span>
          <span style={{ textAlign: "right" }}>Action</span>
        </div>

        {sheets.map((sheet) => {
          const checkout = checkoutMap?.get(sheet.id);
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
          const sheetSpUrl = sharePointFileUrl(sheet.sharepointUrl, sheet.destinationUrl, {
            preferDropOff: preferSharePointDropOff({
              sheetState: sheet.state,
              checkoutStatus: checkout?.status,
            }),
          });
          const isSelectedRow = selectedSheetId === sheet.id;
          const activityOpen = expandedActivity.has(sheet.id);

          return (
            <div key={sheet.id}>
              <div
                className={`${rowClass} ${isSelectedRow ? styles.sheetRowSelected : ""}`}
                role="row"
              >
                {showCheckboxColumn ? (
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
                  <Text
                    size={isFull ? 300 : 200}
                    className={`${styles.sheetNumber} ${onSheetClick ? styles.clickableNumber : ""}`}
                    title={displayNum}
                    onClick={onSheetClick ? () => onSheetClick(sheet.id) : undefined}
                  >
                    <DocIcon style={{ marginRight: 6, verticalAlign: "middle", color: tokens.colorNeutralForeground3 }} />
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
                        <InfoIcon aria-label="Why is this marked new?" style={{ color: tokens.colorNeutralForeground3 }} />
                      </Tooltip>
                    </span>
                  )}
                </div>
                <div className={styles.statusCell}>
                  <SheetStatusBadge sheetState={sheet.state} checkout={checkout} size={isFull ? "medium" : "small"} />
                </div>
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
                        size={buttonSize}
                        aria-label={`Open ${displayNum} in SharePoint`}
                      />
                    </Tooltip>
                  ) : (
                    <Text size={100} className={styles.sheetMetaMuted}>—</Text>
                  )}
                </div>
                <div className={styles.sheetActions}>
                  {showPerRowActivity && (
                    <Tooltip content="Show activity" relationship="label">
                      <Button
                        appearance={activityOpen ? "primary" : "subtle"}
                        icon={<History24Regular />}
                        size={buttonSize}
                        aria-label={`Activity for ${displayNum}`}
                        onClick={() => toggleActivity(sheet.id)}
                      />
                    </Tooltip>
                  )}
                  {checkoutEnabled && requestable && (
                    <Button
                      appearance="primary"
                      size={buttonSize}
                      icon={checkOutSheets.isPending ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
                      disabled={checkOutSheets.isPending}
                      onClick={() => runCheckout([sheet.id])}
                    >
                      {checkOutSheets.isPending ? "…" : checkoutSingleLabel(requireApproval)}
                    </Button>
                  )}
                  {checkoutEnabled && checkout?.status === CheckoutStatus.Requested && (
                    <Text size={100} className={styles.sheetMetaMuted}>Pending approval</Text>
                  )}
                </div>
              </div>
              {showPerRowActivity && activityOpen && (
                <div className={styles.activityPanel}>
                  <SheetActivityPanel
                    sheetId={sheet.id}
                    drawingId={drawingId}
                    reservationType={reservationType}
                    documentSubtype={documentSubtype}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
