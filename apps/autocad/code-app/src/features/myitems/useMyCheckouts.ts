import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { Enmax_autocadcheckoutsService, Enmax_autocaddrawingsService } from "../../generated";
import type { GridFetchParams } from "../../components/DataGrid";

export interface MyCheckout {
  checkoutId: string;
  drawingId: string;
  drawingNumber: string;
  drawingTitle: string;
  drawingLibraryUrl: string;
  checkedOutOn: string;
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

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHECKOUT_SELECT = [
  "enmax_autocadcheckoutid", "enmax_acdnstatus", "enmax_acdnreminderstage",
  "enmax_acdncheckedouton", "_enmax_acdndrawing_value",
] as const;

async function resolveDrawings(checkouts: { _enmax_acdndrawing_value?: string | null }[]) {
  const drawingIds = [...new Set(
    checkouts.map(c => c._enmax_acdndrawing_value).filter((id): id is string => !!id && GUID_RE.test(id)),
  )];
  const map = new Map<string, { number: string; title: string; libraryUrl: string }>();
  if (drawingIds.length > 0) {
    const filter = drawingIds.map(id => `enmax_autocaddrawingid eq '${id}'`).join(" or ");
    const dr = await Enmax_autocaddrawingsService.getAll({
      filter: `(${filter})`,
      select: ["enmax_autocaddrawingid", "enmax_acdnnumber", "enmax_acdntitle", "enmax_acdnsplibraryurl"],
    });
    for (const d of dr.data ?? []) {
      map.set(d.enmax_autocaddrawingid, {
        number:     d.enmax_acdnnumber ?? "",
        title:      d.enmax_acdntitle  ?? "",
        libraryUrl: d.enmax_acdnsplibraryurl ?? "",
      });
    }
  }
  return map;
}

function mapCheckout(c: Record<string, unknown>, drawingMap: Map<string, { number: string; title: string; libraryUrl: string }>): MyCheckout {
  const drawingId = c["_enmax_acdndrawing_value"] as string | undefined ?? "";
  const drawing   = drawingMap.get(drawingId) ?? { number: "", title: "", libraryUrl: "" };
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
    checkedOutOn:       (c["enmax_acdncheckedouton"] as string | undefined) ?? "",
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
  const statusFilter = showFinalised
    ? `_ownerid_value eq '${userId}'`
    : `_ownerid_value eq '${userId}' and (enmax_acdnstatus eq 1 or enmax_acdnstatus eq 2)`;

  const result = await Enmax_autocadcheckoutsService.getAll({
    filter:  statusFilter,
    select:  [...CHECKOUT_SELECT],
    orderBy: ["enmax_acdncheckedouton desc"],
  });
  if (!result.success) throw new Error("Checkouts fetch failed");
  const checkouts = result.data ?? [];
  const drawingMap = await resolveDrawings(checkouts as unknown as Record<string, unknown>[]);
  let rows = (checkouts as unknown as Record<string, unknown>[]).map(c => mapCheckout(c, drawingMap));

  if (params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter(r =>
      r.drawingNumber.toLowerCase().includes(q) ||
      r.drawingTitle.toLowerCase().includes(q) ||
      r.statusLabel.toLowerCase().includes(q),
    );
  }

  if (params.sort) {
    const { column, direction } = params.sort;
    rows = [...rows].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[column];
      const bv = (b as unknown as Record<string, unknown>)[column];
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return direction === "asc" ? cmp : -cmp;
    });
  }

  const totalCount = rows.length;
  const start = params.page * params.pageSize;
  return { rows: rows.slice(start, start + params.pageSize), totalCount };
}

export function useMyCheckouts(showFinalised = false) {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey:     ["my-checkouts", user?.id, showFinalised],
    enabled:      !!user?.id,
    throwOnError: false,
    queryFn: async () => {
      const statusFilter = showFinalised
        ? `_ownerid_value eq '${user!.id}'`
        : `_ownerid_value eq '${user!.id}' and (enmax_acdnstatus eq 1 or enmax_acdnstatus eq 2)`;

      const result = await Enmax_autocadcheckoutsService.getAll({
        filter:  statusFilter,
        select:  [...CHECKOUT_SELECT],
        orderBy: ["enmax_acdncheckedouton desc"],
      });
      if (!result.success) throw new Error("Checkouts fetch failed");
      const checkouts = result.data ?? [];
      const drawingMap = await resolveDrawings(checkouts as unknown as Record<string, unknown>[]);
      return (checkouts as unknown as Record<string, unknown>[]).map(c => mapCheckout(c, drawingMap));
    },
  });
}
