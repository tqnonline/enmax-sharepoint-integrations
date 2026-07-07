import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../../../.power/schemas/appschemas/dataSourcesInfo";

const client = getClient(dataSourcesInfo);

export interface AddChildItemsInput {
  /** GUID of the base Drawing/Procedure to append children to. */
  drawingId: string;
  /** Number of child items (-sss) to append (1..999). */
  count: number;
}

export interface AddChildItemsResult {
  childrenCreated: number;
  firstChildNumber: number;
  lastChildNumber: number;
  baseNumber: string;
}

/**
 * Invokes the unbound enmax_acdnAddChildItems Custom API (ADR 0001 #2/#6).
 * The Drawing input is an EntityReference and MUST use the @odata.id binding —
 * the @odata.type+pk "Entity" shape does not bind to an EntityReference param
 * (same lesson as enmax_acdnIssueNumbers.Reservation in useApproveReservation).
 */
export async function addChildItems(input: AddChildItemsInput): Promise<AddChildItemsResult> {
  const result = await client.executeAsync<Record<string, unknown>, Record<string, unknown>>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnAddChildItems",
        tableName: "enmax_acdnaddchilditems",
        body: {
          Drawing: { "@odata.id": `enmax_autocaddrawings(${input.drawingId})` },
          Count: input.count,
        },
      },
    },
  });

  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Add to existing failed");
  }

  return {
    childrenCreated:  (result.data?.["ChildrenCreated"]  as number) ?? 0,
    firstChildNumber: (result.data?.["FirstChildNumber"] as number) ?? 0,
    lastChildNumber:  (result.data?.["LastChildNumber"]  as number) ?? 0,
    baseNumber:       (result.data?.["BaseNumber"]        as string) ?? "",
  };
}
