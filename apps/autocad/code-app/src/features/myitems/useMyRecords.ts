import {
  Enmax_autocadreservationsService,
  Enmax_autocaddrawingsService,
  Enmax_autocadsheetsService,
  Enmax_autocadcheckoutsService,
} from "../../generated";
import type { GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { logDataverseError } from "../../components/DataGrid/dataverseError";
import { isGuid } from "../../lib/guid";
import { typeFilterClause } from "../reserve/taxonomyFilters";
import type { MyRecordTypeFilter } from "../reserve/taxonomyFilters";
import { documentDisplayNumber, reservationTypeDisplayLabel } from "../reserve/terminology";
import { taxonomyDisplaysFromRaw } from "../../lib/taxonomyDisplays";
import { RESERVATION_STATUS } from "./useMyReservations";
import {
  reservationAwaitingIssuanceLabel,
  reservationIssuanceComplete,
} from "../approvals/compositionUtils";
import {
  applyMyRecordListFilters,
  type MyRecordListFilters,
} from "./myItemListFilters";
import { CheckoutStatus } from "../checkout/api/checkoutClient";

export type { MyRecordListFilters } from "./myItemListFilters";

/** Sheet lifecycle (enmax_acdn_sheetstate) — not the same numeric values as drawing state. */
const SHEET_STATE = {
  Available: 2,
  CheckedOut: 3,
  AwaitingValidation: 4,
} as const;

const SHEET_STATE_FOR_TAB: Record<"available" | "checkedout", number> = {
  available:  SHEET_STATE.Available,
  checkedout: SHEET_STATE.CheckedOut,
};

export const SHEET_STATE_LABELS: Record<number, string> = {
  0: "None",
  1: "Pending Initial Upload",
  2: "Available",
  3: "Checked Out",
  4: "Awaiting Validation",
  5: "Obsolete",
  6: "Void",
};

/** Open / pending checkout statuses on enmax_acdn_checkoutstatus. */
const OPEN_CHECKOUT_STATUSES = new Set([1, 2, 6]);
/** Terminal checkout statuses (approved, declined, forced). */
const CLOSED_CHECKOUT_STATUSES = new Set([3, 4, 5]);

const CHECKOUT_SELECT = [
  "enmax_autocadcheckoutid",
  "enmax_acdnstatus",
  "enmax_acdncheckedouton",
  "enmax_acdnclosedon",
  "createdon",
  "_enmax_acdnsheet_value",
  "_enmax_acdndrawing_value",
  "_enmax_acdncheckedoutby_value",
  "_enmax_acdnclosedby_value",
] as const;
export type { MyRecordTypeFilter } from "../reserve/taxonomyFilters";
export type MyRecordStateFilter = "reservations" | "available" | "pendingapproval" | "checkedout";
export type MyRecordSource = "reservation" | "record";

export interface MyRecordRow {
  id: string;
  drawingId?: string;
  number: string;
  baseNumber?: string;
  sheetNumber?: number;
  title: string;
  typeLabel: string;
  statusLabel: string;
  state: number;
  createdOn: string;
  approvedOn: string;
  submittedById: string;
  submittedByName: string;
  approvedById: string;
  approvedByName: string;
  checkedOutOn: string;
  checkedInOn: string;
  revisionDate: string;
  libraryUrl: string;
  destinationUrl: string;
  source: MyRecordSource;
  /** Reservation-only fields for composition rendering. */
  reservationNumber?: string;
  issuedNumbers?: string;
  businessId?: string;
  assetId?: string;
  unitId?: string;
  domainId?: string;
  systemId?: string;
  kindId?: string;
  businessDisplay: string;
  assetDisplay: string;
  unitDisplay: string;
  domainDisplay: string;
  systemDisplay: string;
  kindDisplay: string;
  sequenceType?: number;
  targetDrawingId?: string;
  targetDrawingNumber?: string;
  appendFirst?: number;
  appendLast?: number;
  enmax_acdnreservationtype?: number;
  enmax_acdndocumentsubtype?: number;
}

const SHEET_SORT_COLS = new Set([
  "enmax_acdnsheetnumber", "enmax_acdnfilename", "enmax_acdnstate",
  "checkedOutOn", "checkedInOn", "revisionDate",
]);

const RESERVATION_SELECT = [
  "enmax_autocadreservationid", "enmax_acdnreservationid", "enmax_acdnstatus",
  "enmax_acdnissuednumbers", "enmax_acdnreason", "createdon", "enmax_acdnapprovedon",
  "_createdby_value", "_enmax_acdnapprover_value",
  "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
  "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
  "enmax_acdnreservationtype", "enmax_acdndocumentsubtype",
  "enmax_acdnsequencetype", "_enmax_acdntargetdrawing_value",
  "enmax_acdnappendfirst", "enmax_acdnappendlast",
] as const;

const SHEET_SELECT = [
  "enmax_autocadsheetid", "_enmax_acdndrawing_value",
  "enmax_acdnsheetnumber", "enmax_acdnfilename", "enmax_acdnstate",
  "enmax_acdnsharepointurl", "enmax_acdnspdestinationurl",
  "enmax_acdnreservationtype", "enmax_acdndocumentsubtype",
  "createdon", "modifiedon", "_createdby_value",
] as const;

/** Submitter-scoped reservation filter (createdby, not owner — reservations are team-owned). */
function reservationFilter(userId: string, typeFilter: MyRecordTypeFilter): string {
  return [`_createdby_value eq '${userId}'`, typeFilterClause(typeFilter)].join(" and ");
}

/**
 * Sheets and drawings inherit the reservation owner (BU team), not the submitter.
 * Scope Available/Checked Out rows to documents under drawings from the user's reservations.
 */
function sheetFilterForDrawings(
  drawingIds: string[],
  stateValue?: number,
): string {
  if (drawingIds.length === 0) {
    return "enmax_autocadsheetid eq '00000000-0000-0000-0000-000000000000'";
  }
  const drawingClause = drawingIds.map((id) => `_enmax_acdndrawing_value eq '${id}'`).join(" or ");
  const parts = [`(${drawingClause})`];
  if (stateValue != null) parts.push(`enmax_acdnstate eq ${stateValue}`);
  return parts.join(" and ");
}

const DRAWING_ID_CHUNK = 40;

async function fetchUserScopedDrawingIds(
  userId: string,
  typeFilter: MyRecordTypeFilter,
): Promise<string[]> {
  const reservations = await Enmax_autocadreservationsService.getAll({
    filter: reservationFilter(userId, typeFilter),
    select: ["enmax_autocadreservationid"],
    top: MY_RECORD_FETCH_CAP,
  });
  if (!reservations.success) {
    logDataverseError("MyRecords/ReservationsForDrawings", reservations.error);
    return [];
  }

  const reservationIds = (reservations.data ?? [])
    .map((r) => r.enmax_autocadreservationid)
    .filter(isGuid);
  if (reservationIds.length === 0) return [];

  const drawingIds: string[] = [];
  for (let i = 0; i < reservationIds.length; i += DRAWING_ID_CHUNK) {
    const chunk = reservationIds.slice(i, i + DRAWING_ID_CHUNK);
    const reservationClause = chunk
      .map((id) => `_enmax_acdnreservation_value eq '${id}'`)
      .join(" or ");
    const drawings = await Enmax_autocaddrawingsService.getAll({
      filter: `(${reservationClause})`,
      select: ["enmax_autocaddrawingid"],
      top: MY_RECORD_FETCH_CAP,
    });
    if (!drawings.success) {
      logDataverseError("MyRecords/DrawingsForUser", drawings.error);
      continue;
    }
    for (const row of drawings.data ?? []) {
      if (row.enmax_autocaddrawingid) drawingIds.push(row.enmax_autocaddrawingid);
    }
  }
  return [...new Set(drawingIds)];
}

async function fetchSheetsForDrawings(
  drawingIds: string[],
  stateValue?: number,
): Promise<RawSheet[]> {
  if (drawingIds.length === 0) return [];

  const rows: RawSheet[] = [];
  for (let i = 0; i < drawingIds.length; i += DRAWING_ID_CHUNK) {
    const chunk = drawingIds.slice(i, i + DRAWING_ID_CHUNK);
    const result = await Enmax_autocadsheetsService.getAll({
      filter: sheetFilterForDrawings(chunk, stateValue),
      select: [...SHEET_SELECT],
      orderBy: ["enmax_acdnsheetnumber asc"],
      top: MY_RECORD_FETCH_CAP,
    });
    if (!result.success) {
      logDataverseError("MyRecords/Sheets", result.error);
      continue;
    }
    rows.push(...((result.data ?? []) as RawSheet[]));
  }
  return rows;
}

type RawReservation = {
  enmax_autocadreservationid: string;
  enmax_acdnreservationid?: string;
  enmax_acdnstatus?: number;
  enmax_acdnissuednumbers?: string;
  enmax_acdnreason?: string;
  createdon?: string;
  enmax_acdnapprovedon?: string;
  _createdby_value?: string;
  "_createdby_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnapprover_value?: string;
  "_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"?: string;
  _enmax_acdnbusiness_value?: string;
  _enmax_acdnasset_value?: string;
  _enmax_acdnunit_value?: string;
  _enmax_acdndomain_value?: string;
  _enmax_acdnsystem_value?: string;
  _enmax_acdnkind_value?: string;
  "_enmax_acdnbusiness_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdnasset_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdnunit_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdndomain_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdnsystem_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_enmax_acdnkind_value@OData.Community.Display.V1.FormattedValue"?: string;
  enmax_acdnreservationtype?: number;
  enmax_acdndocumentsubtype?: number;
  enmax_acdnsequencetype?: number;
  _enmax_acdntargetdrawing_value?: string;
  enmax_acdnappendfirst?: number;
  enmax_acdnappendlast?: number;
};

type RawSheet = {
  enmax_autocadsheetid: string;
  _enmax_acdndrawing_value?: string;
  enmax_acdnsheetnumber?: number;
  enmax_acdnfilename?: string;
  enmax_acdnstate?: number;
  enmax_acdnreservationtype?: number;
  enmax_acdndocumentsubtype?: number;
  enmax_acdnsharepointurl?: string;
  enmax_acdnspdestinationurl?: string;
  createdon?: string;
  modifiedon?: string;
  _createdby_value?: string;
  "_createdby_value@OData.Community.Display.V1.FormattedValue"?: string;
};

interface SheetCheckoutMeta {
  status: number;
  checkedOutOn: string;
  checkedInOn: string;
  checkedOutById: string;
  checkedOutByName: string;
  closedById: string;
  closedByName: string;
}

interface DrawingMeta {
  number: string;
  title: string;
  reservationType?: number;
  documentSubtype?: number;
  businessId: string;
  assetId: string;
  unitId: string;
  domainId: string;
  systemId: string;
  kindId: string;
  businessDisplay: string;
  assetDisplay: string;
  unitDisplay: string;
  domainDisplay: string;
  systemDisplay: string;
  kindDisplay: string;
}

function reservationStatusLabel(r: RawReservation): string {
  const status = r.enmax_acdnstatus ?? 1;
  const base = RESERVATION_STATUS[status] ?? String(status);
  if (status === 2 && !reservationIssuanceComplete(r)) {
    return reservationAwaitingIssuanceLabel({
      sequenceType: r.enmax_acdnsequencetype,
      targetDrawingId: r._enmax_acdntargetdrawing_value,
    });
  }
  return base;
}

async function fetchTargetDrawingNumberMap(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(isGuid))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const filter = unique.map((id) => `enmax_autocaddrawingid eq '${id}'`).join(" or ");
  const dr = await Enmax_autocaddrawingsService.getAll({
    filter: `(${filter})`,
    select: ["enmax_autocaddrawingid", "enmax_acdnnumber"],
  });
  for (const d of dr.data ?? []) {
    if (d.enmax_autocaddrawingid) {
      map.set(d.enmax_autocaddrawingid, d.enmax_acdnnumber ?? "");
    }
  }
  return map;
}

async function fetchDrawingMetaMap(ids: string[]): Promise<Map<string, DrawingMeta>> {
  const unique = [...new Set(ids.filter(isGuid))];
  const map = new Map<string, DrawingMeta>();
  if (unique.length === 0) return map;
  const filter = unique.map((id) => `enmax_autocaddrawingid eq '${id}'`).join(" or ");
  const result = await Enmax_autocaddrawingsService.getAll({
    filter: `(${filter})`,
    select: [
      "enmax_autocaddrawingid",
      "enmax_acdnnumber",
      "enmax_acdntitle",
      "enmax_acdnreservationtype",
      "enmax_acdndocumentsubtype",
      "_enmax_acdnbusiness_value",
      "_enmax_acdnasset_value",
      "_enmax_acdnunit_value",
      "_enmax_acdndomain_value",
      "_enmax_acdnsystem_value",
      "_enmax_acdnkind_value",
    ],
  });
  for (const row of result.data ?? []) {
    const raw = row as unknown as Record<string, unknown>;
    const id = (raw["enmax_autocaddrawingid"] as string | undefined) ?? "";
    if (!id) continue;
    map.set(id, {
      number: (raw["enmax_acdnnumber"] as string | undefined) ?? "",
      title: (raw["enmax_acdntitle"] as string | undefined) ?? "",
      reservationType: raw["enmax_acdnreservationtype"] as number | undefined,
      documentSubtype: raw["enmax_acdndocumentsubtype"] as number | undefined,
      businessId: (raw["_enmax_acdnbusiness_value"] as string | undefined) ?? "",
      assetId: (raw["_enmax_acdnasset_value"] as string | undefined) ?? "",
      unitId: (raw["_enmax_acdnunit_value"] as string | undefined) ?? "",
      domainId: (raw["_enmax_acdndomain_value"] as string | undefined) ?? "",
      systemId: (raw["_enmax_acdnsystem_value"] as string | undefined) ?? "",
      kindId: (raw["_enmax_acdnkind_value"] as string | undefined) ?? "",
      businessDisplay:
        (raw["_enmax_acdnbusiness_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? "",
      assetDisplay:
        (raw["_enmax_acdnasset_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? "",
      unitDisplay:
        (raw["_enmax_acdnunit_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? "",
      domainDisplay:
        (raw["_enmax_acdndomain_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? "",
      systemDisplay:
        (raw["_enmax_acdnsystem_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? "",
      kindDisplay:
        (raw["_enmax_acdnkind_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? "",
    });
  }
  return map;
}

function toReservationRow(r: RawReservation, targetDrawingMap: Map<string, string>): MyRecordRow {
  const status = r.enmax_acdnstatus ?? 1;
  const targetId = r._enmax_acdntargetdrawing_value;
  const submittedById = r._createdby_value ?? "";
  const approvedById = r._enmax_acdnapprover_value ?? "";
  const taxonomy = taxonomyDisplaysFromRaw(r);
  return {
    id:                r.enmax_autocadreservationid,
    number:            r.enmax_acdnreservationid ?? "",
    title:             r.enmax_acdnreason ?? "",
    typeLabel:         reservationTypeDisplayLabel(r.enmax_acdnreservationtype, r.enmax_acdndocumentsubtype),
    statusLabel:       reservationStatusLabel(r),
    state:             status,
    createdOn:         r.createdon ?? "",
    approvedOn:        r.enmax_acdnapprovedon ?? "",
    submittedById,
    submittedByName:   r["_createdby_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    approvedById,
    approvedByName:    r["_enmax_acdnapprover_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    checkedOutOn:      "",
    checkedInOn:       "",
    revisionDate:      "",
    libraryUrl:        "",
    destinationUrl:    "",
    source:            "reservation",
    reservationNumber: r.enmax_acdnreservationid ?? "",
    issuedNumbers:     r.enmax_acdnissuednumbers ?? "",
    businessId:        r._enmax_acdnbusiness_value ?? "",
    assetId:           r._enmax_acdnasset_value ?? "",
    unitId:            r._enmax_acdnunit_value ?? "",
    domainId:          r._enmax_acdndomain_value ?? "",
    systemId:          r._enmax_acdnsystem_value ?? "",
    kindId:            r._enmax_acdnkind_value ?? "",
    businessDisplay:   taxonomy.businessDisplay,
    assetDisplay:      taxonomy.assetDisplay,
    unitDisplay:       taxonomy.unitDisplay,
    domainDisplay:     taxonomy.domainDisplay,
    systemDisplay:     taxonomy.systemDisplay,
    kindDisplay:       taxonomy.kindDisplay,
    sequenceType:      r.enmax_acdnsequencetype,
    targetDrawingId:   targetId,
    targetDrawingNumber: targetId ? targetDrawingMap.get(targetId) : undefined,
    appendFirst:       r.enmax_acdnappendfirst,
    appendLast:        r.enmax_acdnappendlast,
    enmax_acdnreservationtype: r.enmax_acdnreservationtype,
    enmax_acdndocumentsubtype: r.enmax_acdndocumentsubtype,
  };
}

function toSheetRow(
  r: RawSheet,
  drawing?: DrawingMeta,
  checkout?: SheetCheckoutMeta,
): MyRecordRow {
  const state = r.enmax_acdnstate ?? 1;
  const reservationType = r.enmax_acdnreservationtype ?? drawing?.reservationType;
  const documentSubtype = r.enmax_acdndocumentsubtype ?? drawing?.documentSubtype;
  const baseNumber = drawing?.number ?? "";
  const sheetNumber = r.enmax_acdnsheetnumber;
  const submittedById = r._createdby_value ?? "";
  const submittedByName =
    r["_createdby_value@OData.Community.Display.V1.FormattedValue"] ?? "";
  // Checked-out rows: requester on the open checkout. Available: sheet creator /
  // last closed-by as "Approved by" when present from a closed checkout.
  const checkedOutById = checkout?.checkedOutById ?? "";
  const checkedOutByName = checkout?.checkedOutByName ?? "";
  const closedById = checkout?.closedById ?? "";
  const closedByName = checkout?.closedByName ?? "";
  return {
    id:             r.enmax_autocadsheetid,
    drawingId:      r._enmax_acdndrawing_value,
    number:         documentDisplayNumber(baseNumber, sheetNumber, reservationType, documentSubtype),
    baseNumber,
    sheetNumber,
    title:          r.enmax_acdnfilename ?? drawing?.title ?? "",
    typeLabel:      reservationTypeDisplayLabel(reservationType, documentSubtype),
    statusLabel:    sheetStatusLabel(state, checkout),
    state,
    createdOn:      r.createdon ?? "",
    approvedOn:     "",
    submittedById:  checkedOutById || submittedById,
    submittedByName: checkedOutByName || submittedByName,
    approvedById:   closedById,
    approvedByName: closedByName,
    checkedOutOn:   checkout?.checkedOutOn ?? "",
    checkedInOn:    checkout?.checkedInOn ?? "",
    revisionDate:   r.modifiedon ?? "",
    libraryUrl:     r.enmax_acdnsharepointurl ?? "",
    destinationUrl: r.enmax_acdnspdestinationurl ?? "",
    source:         "record",
    businessId: drawing?.businessId ?? "",
    assetId: drawing?.assetId ?? "",
    unitId: drawing?.unitId ?? "",
    domainId: drawing?.domainId ?? "",
    systemId: drawing?.systemId ?? "",
    kindId: drawing?.kindId ?? "",
    businessDisplay: drawing?.businessDisplay ?? "",
    assetDisplay: drawing?.assetDisplay ?? "",
    unitDisplay: drawing?.unitDisplay ?? "",
    domainDisplay: drawing?.domainDisplay ?? "",
    systemDisplay: drawing?.systemDisplay ?? "",
    kindDisplay: drawing?.kindDisplay ?? "",
    enmax_acdnreservationtype: reservationType,
    enmax_acdndocumentsubtype: documentSubtype,
  };
}

// Per-user scope is bounded, so fetch the full set once and page it client-side.
// This yields an accurate totalCount for the grid footer/pagination — the Power Apps
// runtime does not reliably return @odata.count, which broke server-paged totals.
const MY_RECORD_FETCH_CAP = 5000;

async function fetchMyReservations(
  userId: string,
  typeFilter: MyRecordTypeFilter,
  params: GridFetchParams,
  listFilters?: MyRecordListFilters,
  displayNumberFor?: (row: MyRecordRow) => string,
): Promise<{ rows: MyRecordRow[]; totalCount: number; skipToken?: string }> {
  // Submitter scope — reservations are stamped to the BU team owner on create, so
  // _ownerid_value would hide the user's own submissions from this page.
  const result = await Enmax_autocadreservationsService.getAll({
    filter:  reservationFilter(userId, typeFilter),
    select:  [...RESERVATION_SELECT],
    orderBy: ["createdon desc"],
    top:     MY_RECORD_FETCH_CAP,
  });
  if (!result.success) {
    logDataverseError("MyRecords/Reservations", result.error);
    throw new Error("My reservations fetch failed");
  }

  const raw = (result.data ?? []) as RawReservation[];
  const targetDrawingMap = await fetchTargetDrawingNumberMap(
    raw.map((r) => r._enmax_acdntargetdrawing_value ?? "").filter(Boolean),
  );
  const rows = raw.map((r) => toReservationRow(r, targetDrawingMap));
  const filtered = listFilters && displayNumberFor
    ? applyMyRecordListFilters(rows, listFilters, "reservations", displayNumberFor)
    : rows;

  return clientPage(filtered, params, {
    searchText: r => [r.number, r.title, r.typeLabel, r.statusLabel, r.issuedNumbers ?? "", r.submittedByName, r.approvedByName],
  });
}

async function fetchCheckoutMetaBySheetIds(
  sheets: RawSheet[],
  stateFilter: "available" | "checkedout" | "pendingapproval",
): Promise<Map<string, SheetCheckoutMeta>> {
  const map = new Map<string, SheetCheckoutMeta>();
  if (sheets.length === 0) return map;

  const sheetIds = [...new Set(sheets.map((s) => s.enmax_autocadsheetid).filter(isGuid))];
  const drawingIds = [
    ...new Set(sheets.map((s) => s._enmax_acdndrawing_value ?? "").filter(isGuid)),
  ];

  const rowsBySheet = new Map<string, Record<string, unknown>[]>();
  const rowsByDrawing = new Map<string, Record<string, unknown>[]>();

  const ingest = (rows: Record<string, unknown>[]) => {
    for (const raw of rows) {
      const sheetId = (raw["_enmax_acdnsheet_value"] as string | undefined) ?? "";
      const drawingId = (raw["_enmax_acdndrawing_value"] as string | undefined) ?? "";
      if (sheetId) {
        const list = rowsBySheet.get(sheetId) ?? [];
        list.push(raw);
        rowsBySheet.set(sheetId, list);
      }
      if (drawingId) {
        const list = rowsByDrawing.get(drawingId) ?? [];
        list.push(raw);
        rowsByDrawing.set(drawingId, list);
      }
    }
  };

  const CHUNK = 40;
  for (let i = 0; i < sheetIds.length; i += CHUNK) {
    const chunk = sheetIds.slice(i, i + CHUNK);
    const filter = chunk.map((id) => `_enmax_acdnsheet_value eq '${id}'`).join(" or ");
    const result = await Enmax_autocadcheckoutsService.getAll({
      filter: `(${filter})`,
      select: [...CHECKOUT_SELECT],
      orderBy: ["createdon desc"],
      top: MY_RECORD_FETCH_CAP,
    } as Parameters<typeof Enmax_autocadcheckoutsService.getAll>[0]);
    if (!result.success) {
      logDataverseError("MyRecords/CheckoutsBySheet", result.error);
      continue;
    }
    ingest((result.data ?? []) as unknown as Record<string, unknown>[]);
  }

  // Legacy drawing-only checkouts (pre ADR 0002) may lack enmax_acdnsheet.
  for (let i = 0; i < drawingIds.length; i += CHUNK) {
    const chunk = drawingIds.slice(i, i + CHUNK);
    const filter = chunk.map((id) => `_enmax_acdndrawing_value eq '${id}'`).join(" or ");
    const result = await Enmax_autocadcheckoutsService.getAll({
      filter: `(${filter})`,
      select: [...CHECKOUT_SELECT],
      orderBy: ["createdon desc"],
      top: MY_RECORD_FETCH_CAP,
    } as Parameters<typeof Enmax_autocadcheckoutsService.getAll>[0]);
    if (!result.success) {
      logDataverseError("MyRecords/CheckoutsByDrawing", result.error);
      continue;
    }
    ingest((result.data ?? []) as unknown as Record<string, unknown>[]);
  }

  for (const sheet of sheets) {
    const sheetRows = rowsBySheet.get(sheet.enmax_autocadsheetid) ?? [];
    let meta = pickCheckoutMetaForTab(sheetRows, stateFilter);
    if (!meta && sheet._enmax_acdndrawing_value) {
      const legacy = (rowsByDrawing.get(sheet._enmax_acdndrawing_value) ?? [])
        .filter((r) => !(r["_enmax_acdnsheet_value"] as string | undefined));
      meta = pickCheckoutMetaForTab(legacy, stateFilter);
    }
    if (meta) map.set(sheet.enmax_autocadsheetid, meta);
  }
  return map;
}

function sheetStatusLabel(sheetState: number, checkout?: SheetCheckoutMeta): string {
  if (checkout?.status === CheckoutStatus.Requested) return "Pending Approval";
  if (checkout?.status === CheckoutStatus.Open) return "Checked Out";
  if (checkout?.status === CheckoutStatus.AwaitingValidation) return "Awaiting Validation";
  return SHEET_STATE_LABELS[sheetState] ?? String(sheetState);
}

function checkoutRowToMeta(raw: Record<string, unknown>): SheetCheckoutMeta {
  return {
    status: (raw["enmax_acdnstatus"] as number | undefined) ?? 0,
    checkedOutOn: (raw["enmax_acdncheckedouton"] as string | undefined) ?? "",
    checkedInOn:  (raw["enmax_acdnclosedon"] as string | undefined) ?? "",
    checkedOutById: (raw["_enmax_acdncheckedoutby_value"] as string | undefined) ?? "",
    checkedOutByName:
      (raw["_enmax_acdncheckedoutby_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? "",
    closedById: (raw["_enmax_acdnclosedby_value"] as string | undefined) ?? "",
    closedByName:
      (raw["_enmax_acdnclosedby_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? "",
  };
}

function pickCheckoutMetaForTab(
  rows: Record<string, unknown>[],
  stateFilter: "available" | "checkedout" | "pendingapproval",
): SheetCheckoutMeta | undefined {
  if (rows.length === 0) return undefined;
  const sorted = [...rows].sort((a, b) =>
    String(b["createdon"] ?? "").localeCompare(String(a["createdon"] ?? "")),
  );

  if (stateFilter === "pendingapproval") {
    const requested = sorted.find(
      (r) => (r["enmax_acdnstatus"] as number) === CheckoutStatus.Requested,
    );
    return requested ? checkoutRowToMeta(requested) : undefined;
  }

  if (stateFilter === "checkedout") {
    const open = sorted.find((r) =>
      OPEN_CHECKOUT_STATUSES.has((r["enmax_acdnstatus"] as number) ?? 0),
    );
    if (open) return checkoutRowToMeta(open);
    const withCheckedOut = sorted.find((r) => r["enmax_acdncheckedouton"]);
    return withCheckedOut ? checkoutRowToMeta(withCheckedOut) : checkoutRowToMeta(sorted[0]!);
  }

  const closed = sorted.find((r) =>
    CLOSED_CHECKOUT_STATUSES.has((r["enmax_acdnstatus"] as number) ?? 0)
    && r["enmax_acdnclosedon"],
  );
  if (closed) return checkoutRowToMeta(closed);
  const withClosedOn = sorted.find((r) => r["enmax_acdnclosedon"]);
  if (withClosedOn) return checkoutRowToMeta(withClosedOn);
  return checkoutRowToMeta(sorted[0]!);
}

async function fetchSheetRecords(
  userId: string,
  typeFilter: MyRecordTypeFilter,
  stateFilter: "available" | "checkedout" | "pendingapproval",
  params: GridFetchParams,
  listFilters?: MyRecordListFilters,
  displayNumberFor?: (row: MyRecordRow) => string,
): Promise<{ rows: MyRecordRow[]; totalCount: number; skipToken?: string }> {
  const isPending = stateFilter === "pendingapproval";
  const stateValue = isPending ? undefined : SHEET_STATE_FOR_TAB[stateFilter];
  const defaultSortCol = stateFilter === "checkedout"
    ? "checkedOutOn"
    : isPending
      ? "checkedOutOn"
      : "revisionDate";
  const safeSortCol = params.sort?.column && (
    SHEET_SORT_COLS.has(params.sort.column)
    || params.sort.column === "checkedOutOn"
    || params.sort.column === "checkedInOn"
    || params.sort.column === "revisionDate"
  )
    ? params.sort.column
    : defaultSortCol;
  const safeSortDir = params.sort?.direction === "asc" ? "asc" : "desc";

  const drawingIds = await fetchUserScopedDrawingIds(userId, typeFilter);
  const rawSheets = await fetchSheetsForDrawings(drawingIds, stateValue);

  const drawingMeta = await fetchDrawingMetaMap(
    rawSheets.map((sheet) => sheet._enmax_acdndrawing_value ?? "").filter(Boolean),
  );
  const checkoutMeta = await fetchCheckoutMetaBySheetIds(rawSheets, stateFilter);
  let rows = rawSheets.map((sheet) =>
    toSheetRow(
      sheet,
      drawingMeta.get(sheet._enmax_acdndrawing_value ?? ""),
      checkoutMeta.get(sheet.enmax_autocadsheetid),
    ),
  );

  if (isPending) {
    rows = rows.filter((r) => {
      const meta = checkoutMeta.get(r.id);
      return meta?.status === CheckoutStatus.Requested;
    });
  }

  if (safeSortCol === "checkedOutOn" || safeSortCol === "checkedInOn" || safeSortCol === "revisionDate") {
    rows = [...rows].sort((a, b) => {
      const av = String(a[safeSortCol as keyof MyRecordRow] ?? "");
      const bv = String(b[safeSortCol as keyof MyRecordRow] ?? "");
      const cmp = av.localeCompare(bv);
      return safeSortDir === "asc" ? cmp : -cmp;
    });
  }

  const filtered = listFilters && displayNumberFor
    ? applyMyRecordListFilters(rows, listFilters, isPending ? "pendingapproval" : stateFilter, displayNumberFor)
    : rows;

  return clientPage(filtered, params, {
    searchText: r => [
      r.number, r.title, r.typeLabel, r.statusLabel,
      r.submittedByName, r.approvedByName,
    ],
  });
}

export async function fetchMyRecordRows(
  userId: string,
  typeFilter: MyRecordTypeFilter,
  stateFilter: MyRecordStateFilter,
  params: GridFetchParams,
  listFilters?: MyRecordListFilters,
  displayNumberFor?: (row: MyRecordRow) => string,
): Promise<{ rows: MyRecordRow[]; totalCount: number; skipToken?: string }> {
  if (!isGuid(userId)) {
    logDataverseError("MyRecords", new Error(`invalid userId: ${userId}`));
    return { rows: [], totalCount: 0 };
  }

  if (stateFilter === "reservations") {
    return fetchMyReservations(userId, typeFilter, params, listFilters, displayNumberFor);
  }
  return fetchSheetRecords(userId, typeFilter, stateFilter, params, listFilters, displayNumberFor);
}

// Upper bound on counted rows per tab. A single user's reservations/drawings are
// far below this; if a tab ever exceeds it the badge shows "500+".
export const MY_RECORD_COUNT_CAP = 500;

export interface MyRecordCount {
  /** Exact count, capped at MY_RECORD_COUNT_CAP. */
  value: number;
  /** True when the real total may exceed value (hit the cap). */
  capped: boolean;
}

/** Filtered row count for tab badges (matches grid totalCount with same filters). */
export async function fetchMyRecordFilteredCount(
  userId: string,
  typeFilter: MyRecordTypeFilter,
  stateFilter: MyRecordStateFilter,
  listFilters?: MyRecordListFilters,
  displayNumberFor?: (row: MyRecordRow) => string,
): Promise<MyRecordCount> {
  const res = await fetchMyRecordRows(
    userId,
    typeFilter,
    stateFilter,
    { search: "", filters: {}, sort: null, page: 0, pageSize: 1 },
    listFilters,
    displayNumberFor,
  );
  const value = res.totalCount;
  return { value, capped: value >= MY_RECORD_COUNT_CAP };
}

/** Count rows for each state within a type (tab badges). */
export async function fetchMyRecordCounts(
  userId: string,
  typeFilter: MyRecordTypeFilter,
  listFilters?: MyRecordListFilters,
  displayNumberFor?: (row: MyRecordRow) => string,
): Promise<Record<MyRecordStateFilter, MyRecordCount>> {
  if (!isGuid(userId)) {
    return {
      reservations: { value: 0, capped: false },
      available:    { value: 0, capped: false },
      pendingapproval: { value: 0, capped: false },
      checkedout:   { value: 0, capped: false },
    };
  }
  const states: MyRecordStateFilter[] = ["reservations", "available", "pendingapproval", "checkedout"];
  const entries = await Promise.all(
    states.map(async (state) => [
      state,
      await fetchMyRecordFilteredCount(userId, typeFilter, state, listFilters, displayNumberFor),
    ] as const),
  );
  return Object.fromEntries(entries) as Record<MyRecordStateFilter, MyRecordCount>;
}

/** Unfiltered totals (no date/number filters) for "X of Y" footers. */
export async function fetchMyRecordAllCounts(
  userId: string,
  typeFilter: MyRecordTypeFilter,
): Promise<Record<MyRecordStateFilter, MyRecordCount>> {
  return fetchMyRecordCounts(userId, typeFilter, {
    number: "",
    from: "",
    to: "",
    documentSubtype: "all",
    peopleIds: [],
  });
}
