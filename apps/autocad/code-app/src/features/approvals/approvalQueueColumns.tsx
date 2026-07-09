import { Badge, Text } from "@fluentui/react-components";
import type { BadgeProps } from "@fluentui/react-components";
import {
  sharePointColumn,
  submittedByColumn,
  dateTimeColumn,
} from "../../components/DataGrid";
import type { ColumnDef } from "../../components/DataGrid";
import { CheckoutStatus } from "../checkout/api/checkoutClient";
import { CheckoutApprovalDrawer } from "../checkout/components/CheckoutApprovalDrawer";
import { ValidationDrawer } from "../checkout/components/ValidationDrawer";
import { DrawingState } from "../checkout/api/checkoutClient";
import { CHECKIN_STATUS_AWAITING, type CheckinRow } from "./hooks/useCheckins";

const STATUS_COLOR: Record<number, BadgeProps["color"]> = {
  1: "informative",
  2: "warning",
  3: "success",
  4: "danger",
  5: "subtle",
  6: "brand",
};

/** Composition columns — available but hidden by default on approval queues. */
function compositionColumns(): ColumnDef<CheckinRow>[] {
  return [
    { id: "business", header: "Business", accessor: (r) => r.businessDisplay, sortable: true, width: 100, visibleByDefault: false },
    { id: "asset", header: "Asset", accessor: (r) => r.assetDisplay, sortable: true, width: 100, visibleByDefault: false },
    { id: "unit", header: "Unit", accessor: (r) => r.unitDisplay, sortable: true, width: 72, visibleByDefault: false },
    { id: "domain", header: "Domain", accessor: (r) => r.domainDisplay, sortable: true, width: 120, visibleByDefault: false },
    { id: "system", header: "System", accessor: (r) => r.systemDisplay, sortable: true, width: 100, visibleByDefault: false },
    { id: "kind", header: "Kind", accessor: (r) => r.kindDisplay, sortable: true, width: 100, visibleByDefault: false },
  ];
}

function documentNumberColumn(): ColumnDef<CheckinRow> {
  return {
    id: "documentDisplayNumber",
    header: "Issued number",
    accessor: (r) => r.documentDisplayNumber || r.drawingNumber,
    sortable: true,
    filterable: false,
    filterType: "text",
    width: 220,
    cell: (r) => (
      <Text
        title={r.documentDisplayNumber || r.drawingNumber || ""}
        weight="semibold"
        style={{ fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}
      >
        {r.documentDisplayNumber || r.drawingNumber || "—"}
      </Text>
    ),
  };
}

function statusColumn(): ColumnDef<CheckinRow> {
  return {
    id: "statusLabel",
    header: "Status",
    accessor: (r) => r.statusLabel,
    sortable: true,
    width: 140,
    cell: (r) => (
      <Badge appearance="filled" color={STATUS_COLOR[r.status] ?? "informative"}>
        {r.statusLabel}
      </Badge>
    ),
  };
}

/** Pending Check Out request queue — lean columns, no date filter. */
export function checkoutRequestColumns(): ColumnDef<CheckinRow>[] {
  return [
    documentNumberColumn(),
    sharePointColumn<CheckinRow>((r) => r.sharePointUrl ?? "", { width: 180 }),
    {
      id: "typeLabel",
      header: "Type",
      accessor: (r) => r.typeLabel,
      sortable: true,
      width: 150,
    },
    submittedByColumn<CheckinRow>({ width: 160 }),
    dateTimeColumn<CheckinRow>({
      id: "submittedOn",
      header: "Requested On",
      accessor: r => r.submittedOn,
      width: 160,
    }),
    statusColumn(),
    ...compositionColumns(),
    {
      id: "actions",
      header: "Actions",
      accessor: () => "",
      width: 160,
      cell: (r) => (
        <CheckoutApprovalDrawer
          checkoutId={r.checkoutId}
          drawingNumber={r.documentDisplayNumber || r.drawingNumber}
          typeLabel={r.typeLabel}
          requestedByName={r.submittedByName}
        />
      ),
    },
  ];
}

/** Check In validation queue — includes submission info, no Approved By (not applicable yet). */
export function checkinValidationColumns(): ColumnDef<CheckinRow>[] {
  return [
    documentNumberColumn(),
    sharePointColumn<CheckinRow>((r) => r.sharePointUrl ?? "", { width: 180 }),
    {
      id: "typeLabel",
      header: "Type",
      accessor: (r) => r.typeLabel,
      sortable: true,
      width: 140,
    },
    submittedByColumn<CheckinRow>({ width: 160 }),
    {
      id: "submissionInfo",
      header: "Submission Info",
      accessor: (r) => r.submissionInfo,
      sortable: false,
      width: 200,
      cell: (r) => (
        <Text title={r.submissionInfo} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.submissionInfo || "—"}
        </Text>
      ),
    },
    dateTimeColumn<CheckinRow>({
      id: "submittedOn",
      header: "Submitted On",
      accessor: r => r.submittedOn,
      width: 160,
    }),
    statusColumn(),
    ...compositionColumns(),
    {
      id: "actions",
      header: "Actions",
      accessor: () => "",
      width: 180,
      cell: (r) =>
        r.status === CheckoutStatus.Requested ? (
          <CheckoutApprovalDrawer
            checkoutId={r.checkoutId}
            drawingNumber={r.documentDisplayNumber || r.drawingNumber}
            typeLabel={r.typeLabel}
            requestedByName={r.submittedByName}
          />
        ) : r.status === CHECKIN_STATUS_AWAITING ? (
          <ValidationDrawer
            checkout={{ id: r.checkoutId, checkedOutBy: r.submittedById, checkedOutOn: r.submittedOn, submissionInfo: r.submissionInfo, newPdfUrls: r.newPdfUrls }}
            drawing={{ id: r.drawingId, state: DrawingState.AwaitingValidation, number: r.drawingNumber, currentRevision: r.currentRevision, missingSheets: r.missingSheets, spLibraryUrl: r.spLibraryUrl }}
          />
        ) : null,
    },
  ];
}

/** Full check-in history grid (date filters + all statuses). */
export function checkinHistoryColumns(): ColumnDef<CheckinRow>[] {
  return checkinValidationColumns();
}
