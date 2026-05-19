import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReserveForm } from "../schema";

interface CreatedReservation {
  enmax_acdnreservationid: string;
  enmax_acdnreservationnumber: string;
}

async function createReservation(form: ReserveForm): Promise<CreatedReservation> {
  const base = (window as unknown as Record<string, string>).__dataverseBaseUrl ??
    "/api/data/v9.2";

  const body = {
    enmax_acdnrecordtype: 1,
    "enmax_acdnbusiness@odata.bind": `/enmax_autocadbusinesses(${form.business})`,
    "enmax_acdnasset@odata.bind":    `/enmax_autocadassets(${form.asset})`,
    "enmax_acdnunit@odata.bind":     `/enmax_autocadunits(${form.unit})`,
    "enmax_acdndomain@odata.bind":   `/enmax_autocaddomains(${form.domain})`,
    "enmax_acdnsystem@odata.bind":   `/enmax_autocadsystems(${form.system})`,
    "enmax_acdnkind@odata.bind":     `/enmax_autocadkinds(${form.kind})`,
    enmax_acdndrawingcount:          Number(form.count),
    enmax_acdnsheetsperdrawing:      Number(form.sheetsPerDrawing),
    enmax_acdnsequencetype:          form.sequenceType === "New" ? 1 : 2,
    enmax_acdnreason:                form.reason,
    enmax_acdnoverride:              form.override,
    enmax_acdnoverridereason:        form.overrideReason ?? null,
    enmax_acdnstatus:                1, // Pending
  };

  const res = await fetch(`${base}/enmax_autocadreservations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw Object.assign(new Error(`Create reservation failed: ${res.status}`), { status: res.status, detail: err });
  }

  return res.json() as Promise<CreatedReservation>;
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
