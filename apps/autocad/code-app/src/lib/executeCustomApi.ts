import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import { WhoAmIService } from "../generated/services/WhoAmIService";

/** Optional input on every custom API — resolved server-side by PluginActor. */
export const ACTING_USER_ID_PARAM = "ActingUserId";

let cachedActingUserId: string | null = null;

/** WhoAmI UserId for the signed-in interactive user. Cached for the session. */
export async function getActingUserId(): Promise<string> {
  if (cachedActingUserId) return cachedActingUserId;
  const whoAmI = await WhoAmIService.WhoAmI();
  if (!whoAmI.success) {
    throw new Error("WhoAmI failed — cannot resolve acting user for custom API call");
  }
  const userId = whoAmI.data?.["UserId"];
  if (typeof userId !== "string" || !userId) {
    throw new Error("WhoAmI response missing UserId");
  }
  cachedActingUserId = userId;
  return userId;
}

/** Test hook — clears the cached WhoAmI id. */
export function clearActingUserIdCache(): void {
  cachedActingUserId = null;
}

export interface CustomApiCall {
  operationName: string;
  tableName: string;
  body?: Record<string, unknown>;
}

type ExecuteResult<T> =
  | { success: true; data: T | undefined }
  | { success: false; error: unknown };

/**
 * Invokes a Dataverse custom API with ActingUserId stamped on every request.
 * Power Apps Code runs under an application identity; plugins use ActingUserId
 * to record the person who clicked the button (checkout, check-in, approve, …).
 */
export async function executeCustomApi<TResponse = unknown>(
  call: CustomApiCall,
): Promise<ExecuteResult<TResponse>> {
  const client = getClient(dataSourcesInfo);
  const actingUserId = await getActingUserId();
  return client.executeAsync<Record<string, unknown>, TResponse>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: call.operationName,
        tableName: call.tableName,
        body: {
          ...call.body,
          [ACTING_USER_ID_PARAM]: actingUserId,
        },
      },
    },
  }) as Promise<ExecuteResult<TResponse>>;
}
