import { Enmax_autocadcheckoutsService, Enmax_autocaddrawingsService } from "../../generated";
import type { GridFetchParams } from "../../components/DataGrid";
import { clientPage } from "../../components/DataGrid/clientPage";
import { logDataverseError } from "../../components/DataGrid/dataverseError";
import { isGuid } from "../../lib/guid";
import { fetchReservationTaxonomyMap, typeLabelForDrawingRow } from "../../lib/drawingTaxonomy";

export interface MyCheckout {
  checkoutId: string;
  drawingId: string;
  drawingNumber: string;
  drawingTitle: string;
  drawingLibraryUrl: string;
  drawingDestinationUrl: string;
  /** Derived "Drawing" | "Standard" | "Procedure Form" from the record. */
  typeLabel: string;
  checkedOutOn: string;
  /** Person the checkout is for (checked-out-by). */
  checkedOutByName: string;
  daysOut: number;
  reminderStage: number;
  reminderStageLabel: string;
  status: number;
  statusLabel: string;
}

const REMINDER_STAGES: Record<number, string> = {
  0: "None",
  1: "Three Month",
  2: "Six Month",
  3: "Twelve Month",
};

const CHECKOUT_STATUSES: Record<number, string> = {
  1: "Open",
  2: "Awaiting Validation",
  3: "Closed Approved",
  4: "Closed Declined",
  5: "Closed Forced",
};

const CHECKOUT_SELECT = [
  "enmax_autocadcheckoutid", "enmax_acdnstatus", "enmax_acdnreminderstage",
  "enmax_acdncheckedouton", "_enmax_acdndrawing_value", "_enmax_acdncheckedoutby_value",
] as const;

interface ResolvedDrawing {
  number: string;
  title: string;
  libraryUrl: string;
  destinationUrl: string;
  typeLabel: string;
}

async function resolveDrawings(checkouts: { _enmax_acdndrawing_value?: string | null }[]) {
  const drawingIds = [...new Set(
    checkouts.map(c => c._enmax_acdndrawing_value).filter(isGuid),
  )];
  const map = new Map<string, ResolvedDrawing>();
  if (drawingIds.length > 0) {
    const filter = drawingIds.map(id => `enmax_autocaddrawingid eq '${id}'`).join(" or ");
    const dr = await Enmax_autocaddrawingsService.getAll({
      filter: `(${filter})`,
      select: [
        "enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdntitle",
        "enmax_acdnsplibraryurl", "enmax_acdnspdestinationurl",
        "enmax_acdnreservationtype", "enmax_acdndocumentsubtype",
        "_enmax_acdnreservation_value",
      ],
    });
    const reservationMap = await fetchReservationTaxonomyMap(
      (dr.data ?? []).map((d) => (d as { _enmax_acdnreservation_value?: string })._enmax_acdnreservation_value ?? ""),
    );
    for (const d of dr.data ?? []) {
      const dd = d as typeof d & {
        enmax_acdnspdestinationurl?: string;
        enmax_acdnreservationtype?: number;
        enmax_acdndocumentsubtype?: number;
        _enmax_acdnreservation_value?: string;
      };
      map.set(dd.enmax_autocaddrawingid, {
        number:         dd.enmax_acdnnumber ?? "",
        title:          dd.enmax_acdntitle  ?? "",
        libraryUrl:     dd.enmax_acdnsplibraryurl ?? "",
        destinationUrl: dd.enmax_acdnspdestinationurl ?? "",
        typeLabel:      typeLabelForDrawingRow(dd as unknown as Record<string, unknown>, reservationMap),
      });
    }
  }
  return map;
}

function mapCheckout(c: Record<string, unknown>, drawingMap: Map<string, ResolvedDrawing>): MyCheckout {
  const drawingId = c["_enmax_acdndrawing_value"] as string | undefined ?? "";
  const drawing   = drawingMap.get(drawingId)
    ?? { number: "", title: "", libraryUrl: "", destinationUrl: "", typeLabel: "Drawing" };
  const checkedOutMs = c["enmax_acdncheckedouton"] ? new Date(c["enmax_acdncheckedouton"] as string).getTime() : Date.now();
  const daysOut      = Math.floor((Date.now() - checkedOutMs) / (1000 * 60 * 60 * 24));
  const status        = (c["enmax_acdnstatus"] as number | undefined) ?? 1;
  const reminderStage = (c["enmax_acdnreminderstage"] as number | undefined) ?? 0;
  return {
    checkoutId:         c["enmax_autocadcheckoutid"] as string,
    drawingId,
    drawingNumber:      drawing.number,
    drawingTitle:       drawing.title,
    drawingLibraryUrl:  drawing.libraryUrl,
    drawingDestinationUrl: drawing.destinationUrl,
    typeLabel:          drawing.typeLabel,
    checkedOutOn:       (c["enmax_acdncheckedouton"] as string | undefined) ?? "",
    checkedOutByName:
      (c["_enmax_acdncheckedoutby_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? "",
    daysOut,
    reminderStage,
    reminderStageLabel: REMINDER_STAGES[reminderStage] ?? String(reminderStage),
    status,
    statusLabel:        CHECKOUT_STATUSES[status] ?? String(status),
  };
}

export async function fetchMyCheckoutRows(
  userId: string,
  showFinalised: boolean,
  params: GridFetchParams,
): Promise<{ rows: MyCheckout[]; totalCount: number }> {
  // Owner filter is the data-isolation control — validate the id is a GUID before
  // interpolating it into the OData filter.
  if (!isGuid(userId)) {
    logDataverseError("MyCheckouts", new Error(`invalid userId: ${userId}`));
    return { rows: [], totalCount: 0 };
  }
  const statusFilter = showFinalised
    ? `_ownerid_value eq '${userId}'`
    : `_ownerid_value eq '${userId}' and (enmax_acdnstatus eq 1 or enmax_acdnstatus eq 2)`;

  const result = await Enmax_autocadcheckoutsService.getAll({
    filter:  statusFilter,
    select:  [...CHECKOUT_SELECT],
    orderBy: ["enmax_acdncheckedouton desc"],
  });
  if (!result.success) {
    logDataverseError("MyCheckouts", result.error);
    throw new Error("Checkouts fetch failed");
  }
  const checkouts = result.data ?? [];
  const drawingMap = await resolveDrawings(checkouts as unknown as Record<string, unknown>[]);
  const rows = (checkouts as unknown as Record<string, unknown>[]).map(c => mapCheckout(c, drawingMap));

  return clientPage(rows, params, {
    searchText: r => [r.drawingNumber, r.drawingTitle, r.statusLabel, r.typeLabel, r.checkedOutByName],
  });
}
