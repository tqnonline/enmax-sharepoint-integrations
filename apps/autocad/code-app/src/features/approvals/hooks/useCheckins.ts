import { useQuery } from "@tanstack/react-query";
import {
  Enmax_autocadcheckoutsService,
  Enmax_autocaddrawingsService,
  Enmax_autocadsheetsService,
  SystemusersService,
} from "../../../generated";
import { logDataverseError } from "../../../components/DataGrid/dataverseError";
import { isGuid } from "../../../lib/guid";
import { fetchReservationTaxonomyMap, typeLabelForDrawingRow } from "../../../lib/drawingTaxonomy";
import { taxonomyDisplaysFromRaw } from "../../../lib/taxonomyDisplays";
import { documentDisplayNumber, DOCUMENT_SUBTYPE_VALUE, RESERVATION_TYPE_VALUE } from "../../reserve/terminology";
import { resolveSharePointFileUrls, sharePointFileUrl } from "../../sharepoint/sharepointUrls";

export interface CheckinRow {
  checkoutId: string;
  batchId: string;
  drawingId: string;
  sheetId: string;
  drawingNumber: string;
  documentDisplayNumber: string;
  /** Derived "Drawing" | "Standard Document" | "Procedure Form" from the record. */
  typeLabel: string;
  businessDisplay: string;
  assetDisplay: string;
  unitDisplay: string;
  domainDisplay: string;
  systemDisplay: string;
  kindDisplay: string;
  submittedById: string;
  submittedByName: string;
  approvedById: string;
  approvedByName: string;
  submittedOn: string;
  status: number;
  statusLabel: string;
  currentRevision: string;
  submissionInfo: string;
  newPdfUrls: string;
  missingSheets: string;
  spLibraryUrl: string;
  sharePointUrl: string;
}

// Checkout status option set.
export const CHECKIN_STATUS_AWAITING = 2;
export const CHECKIN_STATUS_APPROVED = 3;
const CHECKIN_STATUS_LABELS: Record<number, string> = {
  1: "Open",
  2: "Awaiting Validation",
  3: "Approved",
  4: "Declined",
  5: "Force-Closed",
  6: "Requested",
};

async function resolve<T extends string>(
  ids: string[],
  fetcher: (filter: string) => Promise<Record<string, unknown>[]>,
  keyField: T,
): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(ids.filter(isGuid))];
  const map = new Map<string, Record<string, unknown>>();
  if (unique.length === 0) return map;
  const filter = unique.map((id) => `${keyField} eq '${id}'`).join(" or ");
  for (const row of await fetcher(`(${filter})`)) map.set(row[keyField] as string, row);
  return map;
}

export async function fetchCheckins(): Promise<CheckinRow[]> {
  // List ALL check-ins (every status), newest activity first. The grid filters
  // by date / submitter client-side; status is shown as a column.
  const res = await Enmax_autocadcheckoutsService.getAll({
    select: [
      "enmax_autocadcheckoutid", "_ownerid_value", "enmax_acdncheckedouton",
      "enmax_acdnsubmissioninfo", "enmax_acdnnewpdfurls", "_enmax_acdndrawing_value",
      "enmax_acdnstatus", "createdon", "modifiedon", "_enmax_acdnclosedby_value",
      "_enmax_acdncheckedoutby_value",
      "_enmax_acdnsheet_value", "enmax_acdnbatchid",
    ],
    orderBy: ["modifiedon desc"],
    top: 5000,
  });
  if (!res.success) {
    logDataverseError("Checkins", res.error);
    throw new Error("Check-ins fetch failed");
  }
  const checkouts = (res.data ?? []) as unknown as Record<string, unknown>[];

  const drawingMap = await resolve(
    checkouts.map((c) => c["_enmax_acdndrawing_value"] as string),
    async (filter) => {
      const dr = await Enmax_autocaddrawingsService.getAll({
        filter,
        select: [
          "enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdncurrentrevision",
          "enmax_acdnmissingsheets", "enmax_acdnsplibraryurl",
          "enmax_acdnreservationtype", "enmax_acdndocumentsubtype",
          "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
          "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
          "_enmax_acdnreservation_value",
        ],
      });
      return (dr.data ?? []) as unknown as Record<string, unknown>[];
    },
    "enmax_autocaddrawingid",
  );

  const reservationMap = await fetchReservationTaxonomyMap(
    [...drawingMap.values()].map((d) => d["_enmax_acdnreservation_value"] as string),
  );

  const sheetMap = await resolve(
    checkouts.map((c) => c["_enmax_acdnsheet_value"] as string),
    async (filter) => {
      const sr = await Enmax_autocadsheetsService.getAll({
        filter,
        select: [
          "enmax_autocadsheetid",
          "enmax_acdnfilename",
          "enmax_acdnsheetnumber",
          "enmax_acdnreservationtype",
          "enmax_acdndocumentsubtype",
          "enmax_acdnsharepointurl",
          "enmax_acdnsharepointitemid",
          "enmax_acdnbatchid",
          "_enmax_acdndrawing_value",
          "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
          "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
        ],
      });
      return (sr.data ?? []) as unknown as Record<string, unknown>[];
    },
    "enmax_autocadsheetid",
  );

  const userMap = await resolve(
    checkouts.flatMap((c) => [
      c["_enmax_acdncheckedoutby_value"] as string,
      c["_ownerid_value"] as string,
      c["_enmax_acdnclosedby_value"] as string,
    ]),
    async (filter) => {
      const ur = await SystemusersService.getAll({ filter, select: ["systemuserid", "fullname"] });
      return (ur.data ?? []) as unknown as Record<string, unknown>[];
    },
    "systemuserid",
  );

  return checkouts.map((c) => {
    const drawingId = (c["_enmax_acdndrawing_value"] as string) ?? "";
    const sheetId = (c["_enmax_acdnsheet_value"] as string) ?? "";
    const ownerId = (c["_ownerid_value"] as string) ?? "";
    const checkedOutById = (c["_enmax_acdncheckedoutby_value"] as string) ?? ownerId;
    const closedById = (c["_enmax_acdnclosedby_value"] as string) ?? "";
    const d = drawingMap.get(drawingId) ?? {};
    const s = sheetMap.get(sheetId) ?? {};
    const submitter = userMap.get(checkedOutById) ?? {};
    const approver = userMap.get(closedById) ?? {};
    const status = (c["enmax_acdnstatus"] as number) ?? 0;
    const taxonomy = taxonomyDisplaysFromRaw(s, d);
    const baseNumber = (d["enmax_acdnnumber"] as string) ?? "";
    const sheetNum = s["enmax_acdnsheetnumber"] as number | undefined;
    const reservationType =
      (s["enmax_acdnreservationtype"] as number | undefined) ??
      (d["enmax_acdnreservationtype"] as number | undefined);
    const documentSubtype =
      (s["enmax_acdndocumentsubtype"] as number | undefined) ??
      (d["enmax_acdndocumentsubtype"] as number | undefined);
    const spResolved = resolveSharePointFileUrls({
      reservationType,
      documentSubtype,
      isChildSheet: !(
        reservationType === RESERVATION_TYPE_VALUE.Document
        && documentSubtype === DOCUMENT_SUBTYPE_VALUE.Standard
      ),
      sheetDropOffUrl: s["enmax_acdnsharepointurl"] as string | undefined,
      sheetDestinationUrl: s["enmax_acdnspdestinationurl"] as string | undefined,
      drawingDropOffUrl: d["enmax_acdnsplibraryurl"] as string | undefined,
      drawingDestinationUrl: d["enmax_acdnspdestinationurl"] as string | undefined,
    });
    const sharePointUrl = sharePointFileUrl(spResolved.dropOffUrl, spResolved.destinationUrl);
    const displayNumber = documentDisplayNumber(baseNumber, sheetNum, reservationType, documentSubtype)
      || (s["enmax_acdnfilename"] as string)
      || baseNumber;
    const batchId =
      (c["enmax_acdnbatchid"] as string) ??
      (s["enmax_acdnbatchid"] as string) ??
      "";

    return {
      checkoutId: c["enmax_autocadcheckoutid"] as string,
      batchId,
      drawingId,
      sheetId,
      drawingNumber: baseNumber,
      documentDisplayNumber: displayNumber,
      typeLabel: typeLabelForDrawingRow(d, reservationMap),
      businessDisplay: taxonomy.businessDisplay,
      assetDisplay: taxonomy.assetDisplay,
      unitDisplay: taxonomy.unitDisplay,
      domainDisplay: taxonomy.domainDisplay,
      systemDisplay: taxonomy.systemDisplay,
      kindDisplay: taxonomy.kindDisplay,
      submittedById: checkedOutById,
      submittedByName: (submitter["fullname"] as string) ?? "",
      approvedById: closedById,
      approvedByName: (approver["fullname"] as string) ?? "",
      // "Submitted" = when the check-in last changed state (submission / validation),
      // not the original check-out time which can be far in the past.
      submittedOn: (c["modifiedon"] as string) ?? (c["enmax_acdncheckedouton"] as string) ?? (c["createdon"] as string) ?? "",
      status,
      statusLabel: CHECKIN_STATUS_LABELS[status] ?? String(status),
      currentRevision: (d["enmax_acdncurrentrevision"] as string) ?? "",
      submissionInfo: (c["enmax_acdnsubmissioninfo"] as string) ?? "",
      newPdfUrls: (c["enmax_acdnnewpdfurls"] as string) ?? "",
      missingSheets: (d["enmax_acdnmissingsheets"] as string) ?? "",
      spLibraryUrl: (d["enmax_acdnsplibraryurl"] as string) ?? "",
      sharePointUrl,
    };
  });
}

export function useCheckins(enabled: boolean) {
  return useQuery<CheckinRow[]>({
    queryKey: ["checkins-all"],
    enabled,
    queryFn: fetchCheckins,
    refetchInterval: 30_000,
    throwOnError: false,
  });
}
