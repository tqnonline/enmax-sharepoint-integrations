import { useQuery } from "@tanstack/react-query";
import { Enmax_autocadcheckoutsService, Enmax_autocaddrawingsService, SystemusersService } from "../../../generated";
import { logDataverseError } from "../../../components/DataGrid/dataverseError";
import { isGuid } from "../../../lib/guid";

export interface CheckinRow {
  checkoutId: string;
  drawingId: string;
  drawingNumber: string;
  submittedById: string;
  submittedByName: string;
  submittedOn: string;
  status: number;
  statusLabel: string;
  currentRevision: string;
  submissionInfo: string;
  newPdfUrls: string;
  missingSheets: string;
  spLibraryUrl: string;
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
      "enmax_acdnstatus", "createdon", "modifiedon",
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
        select: ["enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdncurrentrevision", "enmax_acdnmissingsheets", "enmax_acdnsplibraryurl"],
      });
      return (dr.data ?? []) as unknown as Record<string, unknown>[];
    },
    "enmax_autocaddrawingid",
  );

  const userMap = await resolve(
    checkouts.map((c) => c["_ownerid_value"] as string),
    async (filter) => {
      const ur = await SystemusersService.getAll({ filter, select: ["systemuserid", "fullname"] });
      return (ur.data ?? []) as unknown as Record<string, unknown>[];
    },
    "systemuserid",
  );

  return checkouts.map((c) => {
    const drawingId = (c["_enmax_acdndrawing_value"] as string) ?? "";
    const ownerId = (c["_ownerid_value"] as string) ?? "";
    const d = drawingMap.get(drawingId) ?? {};
    const u = userMap.get(ownerId) ?? {};
    const status = (c["enmax_acdnstatus"] as number) ?? 0;
    return {
      checkoutId: c["enmax_autocadcheckoutid"] as string,
      drawingId,
      drawingNumber: (d["enmax_acdnnumber"] as string) ?? "",
      submittedById: ownerId,
      submittedByName: (u["fullname"] as string) ?? "",
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
