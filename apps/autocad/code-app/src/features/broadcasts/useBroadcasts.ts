import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Enmax_autocadbroadcastsService } from "../../generated";
import type { Enmax_autocadbroadcasts } from "../../generated/models/Enmax_autocadbroadcastsModel";

const SELECT = [
  "enmax_autocadbroadcastid", "enmax_acdntitle", "enmax_acdnbody", "enmax_acdnseverity",
  "enmax_acdnstatus", "enmax_acdnaudience", "enmax_acdnstartsat", "enmax_acdnexpiresat",
  "enmax_acdnpinned", "enmax_acdnrequiresack", "statecode", "createdon",
];

const STATUS_DRAFT = 1;
const STATUS_RETIRED = 5;

type WriteFields = Partial<Omit<Enmax_autocadbroadcasts, "enmax_autocadbroadcastid">>;

export function useBroadcasts() {
  return useQuery<Enmax_autocadbroadcasts[]>({
    queryKey: ["broadcasts-admin"],
    queryFn: async () => {
      const res = await Enmax_autocadbroadcastsService.getAll({ select: SELECT, orderBy: ["createdon desc"] });
      if (!res.success) throw new Error("Broadcasts fetch failed");
      return res.data ?? [];
    },
    throwOnError: false,
  });
}

export interface BroadcastInput {
  id?: string;
  title: string;
  body: string;
  severity: number;
  audience: string; // CSV multi-select
  startsAt: string;
  expiresAt: string;
  pinned: boolean;
  requiresAck: boolean;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["broadcasts-admin"] });
  void qc.invalidateQueries({ queryKey: ["home-broadcasts"] });
  void qc.invalidateQueries({ queryKey: ["notification-feed"] });
}

export function useSaveBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BroadcastInput) => {
      const fields: WriteFields = {
        enmax_acdntitle: input.title.trim(),
        enmax_acdnbody: input.body.trim(),
        enmax_acdnseverity: input.severity,
        enmax_acdnaudience: input.audience,
        enmax_acdnstartsat: input.startsAt,
        enmax_acdnexpiresat: input.expiresAt,
        enmax_acdnpinned: input.pinned,
        enmax_acdnrequiresack: input.requiresAck,
      };
      if (input.id) {
        await Enmax_autocadbroadcastsService.update(input.id, fields);
      } else {
        await Enmax_autocadbroadcastsService.create(
          { ...fields, enmax_acdnstatus: STATUS_DRAFT } as unknown as Parameters<typeof Enmax_autocadbroadcastsService.create>[0],
        );
      }
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useRetireBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await Enmax_autocadbroadcastsService.update(id, { enmax_acdnstatus: STATUS_RETIRED } as WriteFields);
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => Enmax_autocadbroadcastsService.delete(id),
    onSuccess: () => invalidate(qc),
  });
}
