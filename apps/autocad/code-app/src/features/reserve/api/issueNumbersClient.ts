import { executeCustomApi } from "../../../lib/executeCustomApi";

export interface IssueNumbersInput {
  reservationId: string;
  count: number;
  businessCode: string;
  assetCode: string;
  unitCode: string;
  domainCode: string;
  systemCode: string;
  kindCode: string;
}

/**
 * Invokes enmax_acdnIssueNumbers and stamps enmax_acdnissuednumbers on the
 * reservation (server-side). Reservation MUST use @odata.type + pk — see ADR / approve flow.
 */
export async function issueNumbers(input: IssueNumbersInput): Promise<void> {
  const result = await executeCustomApi<Record<string, unknown>>({
    operationName: "enmax_acdnIssueNumbers",
    tableName: "enmax_acdnissuenumbers",
    body: {
      Business:    input.businessCode,
      Asset:       input.assetCode,
      Unit:        input.unitCode,
      Domain:      input.domainCode,
      System:      input.systemCode,
      Kind:        input.kindCode,
      Count:       input.count,
      Reservation: {
        "@odata.type": "Microsoft.Dynamics.CRM.enmax_autocadreservation",
        enmax_autocadreservationid: input.reservationId,
      },
    },
  });

  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Number issuance failed");
  }
}
