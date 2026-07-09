import {
  Enmax_autocaddrawingsService,
  Enmax_autocadsheetsService,
} from "../../generated";
import type { GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { logDataverseError } from "../../components/DataGrid/dataverseError";
import { isGuid } from "../../lib/guid";
import {
  documentDisplayNumber,
  reservationHasChildItems,
  reservationTypeDisplayLabel,
} from "../reserve/terminology";
import { DRAWING_STATE_LABELS, type DrawingRow } from "./useSearchDrawings";
import { fetchSearchDrawings } from "./useSearchDrawings";
import { mergeDocumentSearchParams, type SearchListFilters, type SearchTab } from "./searchListFilters";
import { SHEET_STATE_LABELS } from "../myitems/useMyRecords";
import {
  resolveSharePointFileUrls,
} from "../sharepoint/sharepointUrls";

const DRAWING_FETCH_CAP = 500;
const DRAWING_ID_CHUNK = 40;

export interface SearchDocumentRow {
  id: string;
  drawingId: string;
  /** Individual document number (base or base-sss). */
  documentNumber: string;
  baseNumber: string;
  sheetNumber?: number;
  title: string;
  filename: string;
  typeLabel: string;
  state: number;
  stateLabel: string;
  enmax_acdnreservationtype?: number;
  enmax_acdndocumentsubtype?: number;
  sharePointUrl: string;
  destinationUrl: string;
  revisionDate: string;
  currentRevision: string;
  businessDisplay: string;
  assetDisplay: string;
  unitDisplay: string;
  domainDisplay: string;
  systemDisplay: string;
  kindDisplay: string;
  compositionSummary: string;
  submittedByName: string;
  approvedByName: string;
  /** True when the row is a child sheet/document, false for base-only standard documents. */
  isChildDocument: boolean;
}

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
};

const SHEET_SELECT = [
  "enmax_autocadsheetid",
  "_enmax_acdndrawing_value",
  "enmax_acdnsheetnumber",
  "enmax_acdnfilename",
  "enmax_acdnstate",
  "enmax_acdnreservationtype",
  "enmax_acdndocumentsubtype",
  "enmax_acdnsharepointurl",
  "enmax_acdnspdestinationurl",
] as const;

async function fetchSheetsForDrawings(drawingIds: string[]): Promise<RawSheet[]> {
  if (drawingIds.length === 0) return [];
  const rows: RawSheet[] = [];
  for (let i = 0; i < drawingIds.length; i += DRAWING_ID_CHUNK) {
    const chunk = drawingIds.slice(i, i + DRAWING_ID_CHUNK);
    const drawingClause = chunk.map((id) => `_enmax_acdndrawing_value eq '${id}'`).join(" or ");
    const result = await Enmax_autocadsheetsService.getAll({
      filter: `(${drawingClause})`,
      select: [...SHEET_SELECT],
      orderBy: ["enmax_acdnsheetnumber asc"],
      top: DRAWING_FETCH_CAP,
    });
    if (!result.success) {
      logDataverseError("Search/Sheets", result.error);
      continue;
    }
    rows.push(...((result.data ?? []) as RawSheet[]));
  }
  return rows;
}

function compositionSummary(d: DrawingRow): string {
  return [
    d.businessDisplay,
    d.assetDisplay,
    d.unitDisplay,
    d.domainDisplay,
    d.systemDisplay,
    d.kindDisplay,
  ].filter(Boolean).join(" · ");
}

function sheetToRow(sheet: RawSheet, drawing: DrawingRow): SearchDocumentRow {
  const reservationType = sheet.enmax_acdnreservationtype ?? drawing.enmax_acdnreservationtype;
  const documentSubtype = sheet.enmax_acdndocumentsubtype ?? drawing.enmax_acdndocumentsubtype;
  const sheetNumber = sheet.enmax_acdnsheetnumber;
  const state = sheet.enmax_acdnstate ?? 1;
  const sp = resolveSharePointFileUrls({
    reservationType,
    documentSubtype,
    isChildSheet: true,
    sheetDropOffUrl: sheet.enmax_acdnsharepointurl,
    sheetDestinationUrl: sheet.enmax_acdnspdestinationurl,
  });
  return {
    id: sheet.enmax_autocadsheetid,
    drawingId: drawing.id,
    documentNumber: documentDisplayNumber(
      drawing.enmax_acdnnumber,
      sheetNumber,
      reservationType,
      documentSubtype,
    ),
    baseNumber: drawing.enmax_acdnnumber,
    sheetNumber,
    title: drawing.enmax_acdntitle,
    filename: sheet.enmax_acdnfilename ?? "",
    typeLabel: reservationTypeDisplayLabel(reservationType, documentSubtype),
    state,
    stateLabel: SHEET_STATE_LABELS[state] ?? String(state),
    enmax_acdnreservationtype: reservationType,
    enmax_acdndocumentsubtype: documentSubtype,
    sharePointUrl: sp.dropOffUrl,
    destinationUrl: sp.destinationUrl,
    revisionDate: drawing.enmax_acdnrevisiondate,
    currentRevision: drawing.enmax_acdncurrentrevision,
    businessDisplay: drawing.businessDisplay,
    assetDisplay: drawing.assetDisplay,
    unitDisplay: drawing.unitDisplay,
    domainDisplay: drawing.domainDisplay,
    systemDisplay: drawing.systemDisplay,
    kindDisplay: drawing.kindDisplay,
    compositionSummary: compositionSummary(drawing),
    submittedByName: drawing.submittedByName,
    approvedByName: drawing.approvedByName,
    isChildDocument: true,
  };
}

function drawingToRow(drawing: DrawingRow): SearchDocumentRow {
  const state = drawing.enmax_acdnstate;
  const sp = resolveSharePointFileUrls({
    reservationType: drawing.enmax_acdnreservationtype,
    documentSubtype: drawing.enmax_acdndocumentsubtype,
    isChildSheet: false,
    drawingDropOffUrl: drawing.enmax_acdnsplibraryurl,
    drawingDestinationUrl: drawing.enmax_acdnspdestinationurl,
  });
  return {
    id: drawing.id,
    drawingId: drawing.id,
    documentNumber: documentDisplayNumber(
      drawing.enmax_acdnnumber,
      undefined,
      drawing.enmax_acdnreservationtype,
      drawing.enmax_acdndocumentsubtype,
    ),
    baseNumber: drawing.enmax_acdnnumber,
    title: drawing.enmax_acdntitle,
    filename: drawing.enmax_acdntitle,
    typeLabel: drawing.typeLabel,
    state,
    stateLabel: DRAWING_STATE_LABELS[state] ?? String(state),
    enmax_acdnreservationtype: drawing.enmax_acdnreservationtype,
    enmax_acdndocumentsubtype: drawing.enmax_acdndocumentsubtype,
    sharePointUrl: sp.dropOffUrl,
    destinationUrl: sp.destinationUrl,
    revisionDate: drawing.enmax_acdnrevisiondate,
    currentRevision: drawing.enmax_acdncurrentrevision,
    businessDisplay: drawing.businessDisplay,
    assetDisplay: drawing.assetDisplay,
    unitDisplay: drawing.unitDisplay,
    domainDisplay: drawing.domainDisplay,
    systemDisplay: drawing.systemDisplay,
    kindDisplay: drawing.kindDisplay,
    compositionSummary: compositionSummary(drawing),
    submittedByName: drawing.submittedByName,
    approvedByName: drawing.approvedByName,
    isChildDocument: false,
  };
}

async function expandDrawingsToDocuments(drawings: DrawingRow[]): Promise<SearchDocumentRow[]> {
  const withChildren = drawings.filter((d) =>
    reservationHasChildItems(d.enmax_acdnreservationtype, d.enmax_acdndocumentsubtype),
  );
  const baseOnly = drawings.filter((d) =>
    !reservationHasChildItems(d.enmax_acdnreservationtype, d.enmax_acdndocumentsubtype),
  );

  const drawingById = new Map(drawings.map((d) => [d.id, d]));
  const childDrawingIds = withChildren.map((d) => d.id).filter(isGuid);
  const sheets = await fetchSheetsForDrawings(childDrawingIds);

  const rows: SearchDocumentRow[] = baseOnly.map(drawingToRow);
  for (const sheet of sheets) {
    const drawingId = sheet._enmax_acdndrawing_value ?? "";
    const drawing = drawingById.get(drawingId);
    if (!drawing) continue;
    rows.push(sheetToRow(sheet, drawing));
  }

  rows.sort((a, b) => a.documentNumber.localeCompare(b.documentNumber));
  return rows;
}

/** Number/title filter applied client-side on individual document numbers and filenames. */
function applyDocumentTextFilter(rows: SearchDocumentRow[], needle: string): SearchDocumentRow[] {
  if (!needle) return rows;
  const q = needle.toLowerCase();
  return rows.filter((r) =>
    r.documentNumber.toLowerCase().includes(q)
    || r.baseNumber.toLowerCase().includes(q)
    || r.title.toLowerCase().includes(q)
    || r.filename.toLowerCase().includes(q),
  );
}

export async function fetchSearchDocuments(
  tab: SearchTab,
  applied: SearchListFilters,
  params: GridFetchParams,
): Promise<{ rows: SearchDocumentRow[]; totalCount: number }> {
  const merged = mergeDocumentSearchParams(tab, applied, {
    ...params,
    page: 0,
    pageSize: DRAWING_FETCH_CAP,
  });

  const drawingResult = await fetchSearchDrawings(merged);
  let documents = await expandDrawingsToDocuments(drawingResult.rows);

  const numberNeedle = applied.number.trim();
  if (numberNeedle) {
    documents = applyDocumentTextFilter(documents, numberNeedle);
  }

  return clientPage(documents, params, {
    searchText: (r) => [
      r.documentNumber,
      r.baseNumber,
      r.title,
      r.filename,
      r.compositionSummary,
      r.typeLabel,
    ],
  });
}

/** Load a single search result row by sheet or drawing id (for detail page). */
export async function fetchSearchDocumentById(
  documentId: string,
  drawingId: string,
): Promise<SearchDocumentRow | null> {
  if (!isGuid(documentId) || !isGuid(drawingId)) return null;

  const drawingResult = await Enmax_autocaddrawingsService.getAll({
    filter: `enmax_autocaddrawingid eq '${drawingId}'`,
    select: [
      "enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdntitle",
      "enmax_acdncurrentrevision", "enmax_acdnrevisiondate", "enmax_acdnstate",
      "enmax_acdnsheetcount", "enmax_acdnreservationtype", "enmax_acdndocumentsubtype",
      "enmax_acdnsplibraryurl", "enmax_acdnspdestinationurl",
      "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
      "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
      "_createdby_value", "_enmax_acdnreservation_value",
    ],
    top: 1,
  });
  if (!drawingResult.success || !drawingResult.data?.length) return null;

  const raw = drawingResult.data[0] as unknown as Record<string, unknown>;
  const fv = (k: string) =>
    (raw[`${k}@OData.Community.Display.V1.FormattedValue`] as string) ?? "";
  const drawing: DrawingRow = {
    id: raw.enmax_autocaddrawingid as string,
    enmax_acdnnumber: (raw.enmax_acdnnumber as string) ?? "",
    enmax_acdntitle: (raw.enmax_acdntitle as string) ?? "",
    enmax_acdncurrentrevision: (raw.enmax_acdncurrentrevision as string) ?? "",
    enmax_acdnrevisiondate: (raw.enmax_acdnrevisiondate as string) ?? "",
    enmax_acdnstate: (raw.enmax_acdnstate as number) ?? 1,
    enmax_acdnsheetcount: (raw.enmax_acdnsheetcount as number) ?? 0,
    enmax_acdnreservationtype: raw.enmax_acdnreservationtype as number | undefined,
    enmax_acdndocumentsubtype: raw.enmax_acdndocumentsubtype as number | undefined,
    typeLabel: reservationTypeDisplayLabel(
      raw.enmax_acdnreservationtype as number | undefined,
      raw.enmax_acdndocumentsubtype as number | undefined,
    ),
    enmax_acdnsplibraryurl: (raw.enmax_acdnsplibraryurl as string) ?? "",
    enmax_acdnspdestinationurl: (raw.enmax_acdnspdestinationurl as string) ?? "",
    enmax_acdnpresentindropoff: false,
    enmax_acdnpresentindestination: false,
    _enmax_acdnbusiness_value: (raw._enmax_acdnbusiness_value as string) ?? "",
    _enmax_acdnasset_value: (raw._enmax_acdnasset_value as string) ?? "",
    _enmax_acdnunit_value: (raw._enmax_acdnunit_value as string) ?? "",
    _enmax_acdndomain_value: (raw._enmax_acdndomain_value as string) ?? "",
    _enmax_acdnsystem_value: (raw._enmax_acdnsystem_value as string) ?? "",
    _enmax_acdnkind_value: (raw._enmax_acdnkind_value as string) ?? "",
    _enmax_acdnrecordtype_value: "",
    _enmax_acdnrecordphase_value: "",
    _enmax_acdnvendor_value: "",
    _createdby_value: (raw._createdby_value as string) ?? "",
    submittedById: (raw._createdby_value as string) ?? "",
    submittedByName: fv("_createdby_value"),
    approvedById: "",
    approvedByName: "",
    businessDisplay: fv("_enmax_acdnbusiness_value"),
    assetDisplay: fv("_enmax_acdnasset_value"),
    unitDisplay: fv("_enmax_acdnunit_value"),
    domainDisplay: fv("_enmax_acdndomain_value"),
    systemDisplay: fv("_enmax_acdnsystem_value"),
    kindDisplay: fv("_enmax_acdnkind_value"),
    recordTypeDisplay: "",
    recordPhaseDisplay: "",
    vendorDisplay: "",
    requesterDisplay: fv("_createdby_value"),
  };

  if (documentId === drawingId) {
    return drawingToRow(drawing);
  }

  const sheetResult = await Enmax_autocadsheetsService.getAll({
    filter: `enmax_autocadsheetid eq '${documentId}'`,
    select: [...SHEET_SELECT],
    top: 1,
  });
  if (!sheetResult.success || !sheetResult.data?.length) return null;
  return sheetToRow(sheetResult.data[0] as RawSheet, drawing);
}
