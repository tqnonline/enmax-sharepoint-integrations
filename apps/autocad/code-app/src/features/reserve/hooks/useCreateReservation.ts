import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReserveForm } from "../schema";
import { RESERVATION_TYPE_VALUE, DOCUMENT_SUBTYPE_VALUE } from "../terminology";
import { Enmax_autocadreservationsService } from "../../../generated";
import type { Enmax_autocadreservationsBase } from "../../../generated/models/Enmax_autocadreservationsModel";

interface CreatedReservation {
  /** Record GUID — used for routing to the detail page. */
  id: string;
  /** Friendly autonumber (RES-XXXX) for display; falls back to the GUID. */
  number: string;
}

/**
 * When appending children to an existing base (Drawing/Procedure), the caller passes
 * the target base GUID. This routes the "Add to existing" flow through reservation
 * approval instead of calling AddChildItems directly — issuance happens on approve.
 */
export type CreateReservationInput = ReserveForm & { targetDrawingId?: string };

async function createReservation(form: CreateReservationInput): Promise<CreatedReservation> {
  // Lookup fields require OData @odata.bind using the PascalCase navigation property
  // name from the Dataverse relationship XML (NavigationPropertyName), not the
  // lowercase logical attribute name. Case-sensitive in Dataverse OData metadata.
  const body = {
    "enmax_acdnBusiness@odata.bind": `/enmax_autocadbusinesses(${form.business})`,
    "enmax_acdnAsset@odata.bind":    `/enmax_autocadassets(${form.asset})`,
    "enmax_acdnUnit@odata.bind":     `/enmax_autocadunits(${form.unit})`,
    "enmax_acdnDomain@odata.bind":   `/enmax_autocaddomains(${form.domain})`,
    "enmax_acdnSystem@odata.bind":   `/enmax_autocadsystems(${form.system})`,
    "enmax_acdnKind@odata.bind":     `/enmax_autocadkinds(${form.kind})`,
    enmax_acdndrawingcount:     Number(form.count),
    enmax_acdnsheetsperdrawing: Number(form.sheetsPerDrawing),
    // Appending to a target base is always an Existing-sequence reservation (2),
    // regardless of the form's sequenceType.
    enmax_acdnsequencetype:     form.targetDrawingId ? 2 : (form.sequenceType === "New" ? 1 : 2),
    enmax_acdnreason:           form.reason,
    enmax_acdnstatus:           1,
    // Taxonomy (WS1a columns): drives type-aware, base-only vs. child issuance in the
    // AutoCreateDrawings plug-in (ADR 0001 #1). Subtype is only set for Documents.
    enmax_acdnreservationtype:  RESERVATION_TYPE_VALUE[form.reservationType],
    ...(form.reservationType === "Document" && form.documentSubtype
      ? { enmax_acdndocumentsubtype: DOCUMENT_SUBTYPE_VALUE[form.documentSubtype] }
      : {}),
    // Bind the target base so the approver's AddChildItems knows where to append.
    // Uses the PascalCase navigation property name (case-sensitive OData metadata).
    ...(form.targetDrawingId
      ? { "enmax_acdnTargetDrawing@odata.bind": `/enmax_autocaddrawings(${form.targetDrawingId})` }
      : {}),
  } as unknown as Omit<Enmax_autocadreservationsBase, 'enmax_autocadreservationid'>;

  const result = await Enmax_autocadreservationsService.create(body);
  if (!result.success) {
    const err = result.error as { message?: string; status?: number } | undefined;
    const msg = err?.message ?? "Unknown error";
    const status = err?.status;
    throw Object.assign(new Error(msg), { status });
  }

  // Dataverse create returns 204; data may contain the new record or just the ID.
  const guid = result.data?.enmax_autocadreservationid;
  if (!guid) {
    // No GUID back — best effort: use whatever the create returned.
    const fallback = result.data?.enmax_acdnreservationid ?? "pending";
    return { id: fallback, number: fallback };
  }

  // The friendly number (enmax_acdnreservationid, e.g. RES-1051) is an autonumber
  // assigned server-side and is usually absent from the create response. Fetch it so
  // the confirmation page shows RES-XXXX rather than the raw GUID.
  let number = guid;
  try {
    const detail = await Enmax_autocadreservationsService.get(guid, {
      select: ["enmax_acdnreservationid"],
    });
    number = detail.data?.enmax_acdnreservationid ?? guid;
  } catch {
    // non-fatal — fall back to the GUID for display
  }

  return { id: guid, number };
}

export function useCreateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createReservation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["notification-feed"] });
    },
  });
}
