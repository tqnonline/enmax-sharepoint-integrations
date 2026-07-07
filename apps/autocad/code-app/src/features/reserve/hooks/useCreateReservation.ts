import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReserveForm } from "../schema";
import { Enmax_autocadreservationsService } from "../../../generated";
import type { Enmax_autocadreservationsBase } from "../../../generated/models/Enmax_autocadreservationsModel";

interface CreatedReservation {
  enmax_acdnreservationid: string;
}

async function createReservation(form: ReserveForm): Promise<CreatedReservation> {
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
    enmax_acdnsequencetype:     form.sequenceType === "New" ? 1 : 2,
    enmax_acdnreason:           form.reason,
    enmax_acdnstatus:           1,
  } as unknown as Omit<Enmax_autocadreservationsBase, 'enmax_autocadreservationid'>;

  const result = await Enmax_autocadreservationsService.create(body);
  if (!result.success) {
    const err = result.error as { message?: string; status?: number } | undefined;
    const msg = err?.message ?? "Unknown error";
    const status = err?.status;
    throw Object.assign(new Error(msg), { status });
  }

  // Dataverse create returns 204; data may contain the new record or just the ID.
  const id = result.data?.enmax_autocadreservationid
          ?? result.data?.enmax_acdnreservationid
          ?? "pending";
  return { enmax_acdnreservationid: id };
}

export function useCreateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createReservation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
    },
  });
}
