import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Enmax_autocadinappnotificationsService } from "../generated";
import { isGuid } from "../lib/guid";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  severity: number;
  read: boolean;
  deepLinkPath: string;
  createdOn: string;
}

const FIVE_MIN = 5 * 60 * 1000;
const FEED_KEY = "notification-feed";

// In-app notifications for the current user, newest first (top 50). Flow-free: rows are written by
// plug-ins (e.g. check-in). Broadcasts are merged in read-time by the panel, not fanned out here.
export function useNotificationFeed(userId: string | undefined, limit = 50) {
  return useQuery<NotificationItem[]>({
    queryKey: [FEED_KEY, userId, limit],
    enabled: !!userId && isGuid(userId),
    queryFn: async () => {
      const res = await Enmax_autocadinappnotificationsService.getAll({
        filter: `_enmax_acdnrecipient_value eq '${userId}' and statecode eq 0`,
        select: [
          "enmax_autocadinappnotificationid", "enmax_acdntitle", "enmax_acdnbody",
          "enmax_acdnseverity", "enmax_acdnread", "enmax_acdndeeplinkpath", "createdon",
        ],
        orderBy: ["createdon desc"],
        top: limit,
      });
      return (res.data ?? []).map((r) => ({
        id: r.enmax_autocadinappnotificationid,
        title: r.enmax_acdntitle ?? "",
        body: r.enmax_acdnbody ?? "",
        severity: r.enmax_acdnseverity ?? 1,
        read: r.enmax_acdnread ?? false,
        deepLinkPath: r.enmax_acdndeeplinkpath ?? "",
        createdOn: r.createdon ?? "",
      }));
    },
    refetchOnWindowFocus: true,
    refetchInterval: FIVE_MIN, // idle-tab safety net (Finding 5.4: focus refetch is the dominant freshness moment)
  });
}

const readPatch = () => ({ enmax_acdnread: true, enmax_acdnreadon: new Date().toISOString() });

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => Enmax_autocadinappnotificationsService.update(id, readPatch()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [FEED_KEY] }),
  });
}

// Bulk mark-read with optimistic UI + rollback. Caller passes the unread ids (capped to the visible 50).
export function useMarkAllNotificationsRead(userId: string | undefined, limit = 50) {
  const qc = useQueryClient();
  const key = [FEED_KEY, userId, limit];
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => Enmax_autocadinappnotificationsService.update(id, readPatch())));
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationItem[]>(key);
      qc.setQueryData<NotificationItem[]>(key, (old) => old?.map((n) => ({ ...n, read: true })));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: [FEED_KEY] }),
  });
}
