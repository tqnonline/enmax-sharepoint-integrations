import { useQuery } from "@tanstack/react-query";
import { Enmax_autocadauditeventsService } from "../../../generated";

export interface AuditEvent {
  id: string;
  event: number;
  createdOn: string;
  eventLabel: string;
  actedBy: string;
  reason: string;
  fromState: string;
  toState: string;
}

const EVENT_LABELS: Record<number, string> = {
  0: "None",
  1: "Created",
  2: "State Changed",
  3: "Approval Granted",
  4: "Approval Denied",
  5: "Override Used",
  6: "Force Checked In",
  7: "Config Changed",
  8: "Reference Data Changed",
  9: "Finalized",
};

export function useDrawingAuditTrail(subjectIds?: string | string[]) {
  const ids = (Array.isArray(subjectIds) ? subjectIds : subjectIds ? [subjectIds] : [])
    .filter((id): id is string => !!id);
  const queryKey = ["drawing-audit", ...ids.sort()];

  return useQuery<AuditEvent[]>({
    queryKey,
    enabled:  ids.length > 0,
    staleTime: 60_000,
    throwOnError: false,
    queryFn: async () => {
      const filter = ids.length === 1
        ? `enmax_acdnsubjectid eq '${ids[0]!.replace(/'/g, "''")}'`
        : `(${ids.map((id) => `enmax_acdnsubjectid eq '${id.replace(/'/g, "''")}'`).join(" or ")})`;

      const result = await Enmax_autocadauditeventsService.getAll({
        filter,
        select:  [
          "enmax_autocadauditeventid", "createdon",
          "enmax_acdnevent", "enmax_acdnreason",
          "_enmax_acdnactedby_value",
          "enmax_acdnfromstate", "enmax_acdntostate",
        ],
        orderBy: ["createdon desc"],
        top:     50,
      });
      if (!result.success) return [];
      return (result.data ?? []).map(r => {
        const raw   = r as unknown as Record<string, unknown>;
        const event = (raw["enmax_acdnevent"] as number | undefined) ?? 0;
        return {
          id:         raw["enmax_autocadauditeventid"] as string,
          event,
          createdOn:  (raw["createdon"] as string | undefined) ?? "",
          eventLabel: EVENT_LABELS[event] ?? `Event ${event}`,
          actedBy:    (raw["_enmax_acdnactedby_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? "",
          reason:     (raw["enmax_acdnreason"] as string | undefined) ?? "",
          fromState:  (raw["enmax_acdnfromstate"] as string | undefined) ?? "",
          toState:    (raw["enmax_acdntostate"] as string | undefined) ?? "",
        };
      });
    },
  });
}
