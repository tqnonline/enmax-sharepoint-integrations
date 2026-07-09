import {
  Enmax_autocadreservationsService,
  Enmax_autocadbusinessesService,
  Enmax_autocadassetsService,
  Enmax_autocadunitsService,
  Enmax_autocaddomainsService,
  Enmax_autocadsystemsService,
  Enmax_autocadkindsService,
} from "../../generated";

export interface ReservationComposition {
  businessCode: string;
  assetCode: string;
  unitCode: string;
  domainCode: string;
  systemCode: string;
  kindCode: string;
  drawingCount: number;
}

async function lookupCode(
  id: string | undefined,
  fetch: (id: string) => Promise<{ data?: { enmax_acdncode?: string | null } | null }>,
): Promise<string> {
  if (!id) return "";
  try {
    const row = await fetch(id);
    return row.data?.enmax_acdncode?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Resolve composition codes from the reservation's lookup fields (by record id, not org-wide lists). */
export async function fetchReservationComposition(
  reservationId: string,
): Promise<ReservationComposition> {
  const res = await Enmax_autocadreservationsService.get(reservationId, {
    select: [
      "enmax_acdndrawingcount",
      "_enmax_acdnbusiness_value", "_enmax_acdnasset_value", "_enmax_acdnunit_value",
      "_enmax_acdndomain_value", "_enmax_acdnsystem_value", "_enmax_acdnkind_value",
    ],
  });
  if (!res.success || !res.data) {
    throw new Error("Reservation not found");
  }

  const r = res.data;
  const [businessCode, assetCode, unitCode, domainCode, systemCode, kindCode] = await Promise.all([
    lookupCode(r._enmax_acdnbusiness_value, id => Enmax_autocadbusinessesService.get(id, { select: ["enmax_acdncode"] })),
    lookupCode(r._enmax_acdnasset_value,    id => Enmax_autocadassetsService.get(id,    { select: ["enmax_acdncode"] })),
    lookupCode(r._enmax_acdnunit_value,     id => Enmax_autocadunitsService.get(id,     { select: ["enmax_acdncode"] })),
    lookupCode(r._enmax_acdndomain_value,   id => Enmax_autocaddomainsService.get(id,   { select: ["enmax_acdncode"] })),
    lookupCode(r._enmax_acdnsystem_value,   id => Enmax_autocadsystemsService.get(id,   { select: ["enmax_acdncode"] })),
    lookupCode(r._enmax_acdnkind_value,     id => Enmax_autocadkindsService.get(id,     { select: ["enmax_acdncode"] })),
  ]);

  return {
    businessCode,
    assetCode,
    unitCode,
    domainCode,
    systemCode,
    kindCode,
    drawingCount: r.enmax_acdndrawingcount ?? 0,
  };
}

export function assertCompleteComposition(c: ReservationComposition): void {
  const missing: string[] = [];
  if (!c.businessCode) missing.push("Business");
  if (!c.assetCode)    missing.push("Asset");
  if (!c.unitCode)     missing.push("Unit");
  if (!c.domainCode)   missing.push("Domain");
  if (!c.systemCode)   missing.push("System");
  if (!c.kindCode)     missing.push("Kind");
  if (!c.drawingCount || c.drawingCount < 1) missing.push("Count");
  if (missing.length > 0) {
    throw new Error(`Reservation composition incomplete: ${missing.join(", ")}`);
  }
}
