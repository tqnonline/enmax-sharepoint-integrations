import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "../../auth/useCurrentUser";
import {
  Enmax_autocadbroadcastsService,
  Enmax_autocadbroadcastdismissalsService,
  Enmax_autocadcheckoutsService,
  Enmax_autocadnumbersequencesService,
} from "../../generated";
import { fetchMyCheckoutRows, type MyCheckout } from "../myitems/useMyCheckouts";
import { fetchMyReservationRows, type MyReservation } from "../myitems/useMyReservations";
import type { GridFetchParams } from "../../components/DataGrid";
import { isGuid } from "../../lib/guid";
import type { Role } from "../../auth/useUserRole";
import { audienceTargetsRole, isBroadcastActive, severityRank } from "./homeUtils";

const LIST_PARAMS: GridFetchParams = { search: "", filters: {}, sort: null, page: 0, pageSize: 50 };

// ── My open check-outs (status Open/AwaitingValidation), newest first ──
export function useMyOpenCheckouts(userId: string | undefined) {
  return useQuery<MyCheckout[]>({
    queryKey: ["home-open-checkouts", userId],
    enabled: !!userId && isGuid(userId),
    queryFn: async () => {
      const { rows } = await fetchMyCheckoutRows(userId!, false, LIST_PARAMS);
      return rows;
    },
    refetchOnWindowFocus: true,
  });
}

// ── My reservations (active), newest first ──
export function useMyRecentReservations(userId: string | undefined) {
  return useQuery<MyReservation[]>({
    queryKey: ["home-my-reservations", userId],
    enabled: !!userId && isGuid(userId),
    queryFn: async () => {
      const { rows } = await fetchMyReservationRows(userId!, false, LIST_PARAMS);
      return rows;
    },
    refetchOnWindowFocus: true,
  });
}

// ── Check-ins awaiting validation (approver/admin attention) ──
export function usePendingCheckinCount(enabled: boolean) {
  return useQuery<number>({
    queryKey: ["home-pending-checkins"],
    enabled,
    queryFn: async () => {
      const res = await Enmax_autocadcheckoutsService.getAll({
        filter: "enmax_acdnstatus eq 2", // Awaiting Validation
        select: ["enmax_autocadcheckoutid"],
      });
      return res.data?.length ?? 0;
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

// ── Home broadcasts (read-time: every active + role-targeted broadcast). No fan-out. ──
// Pinned broadcasts are sticky (can't be dismissed); non-pinned drop once the user dismisses them.
export interface HomeBroadcast {
  id: string;
  title: string;
  body: string;
  severity: number;
  pinned: boolean;
  requiresAck: boolean;
}

export function useHomeBroadcasts(userId: string | undefined, role: Role) {
  return useQuery<HomeBroadcast[]>({
    queryKey: ["home-broadcasts", userId, role],
    enabled: !!userId && isGuid(userId),
    queryFn: async () => {
      const bres = await Enmax_autocadbroadcastsService.getAll({
        select: [
          "enmax_autocadbroadcastid", "enmax_acdntitle", "enmax_acdnbody",
          "enmax_acdnseverity", "enmax_acdnstatus", "enmax_acdnaudience",
          "enmax_acdnstartsat", "enmax_acdnexpiresat",
          "enmax_acdnpinned", "enmax_acdnrequiresack", "statecode",
        ],
      });
      const now = Date.now();
      const active = (bres.data ?? []).filter(
        (b) => isBroadcastActive(b, now) && audienceTargetsRole(b.enmax_acdnaudience, role),
      );
      const dres = await Enmax_autocadbroadcastdismissalsService.getAll({
        filter: `_enmax_acdnuser_value eq '${userId}'`,
        select: ["_enmax_acdnbroadcast_value"],
      });
      const dismissed = new Set((dres.data ?? []).map((d) => d._enmax_acdnbroadcast_value));
      return active
        // Pinned can't be dismissed → always shown. Non-pinned drop once dismissed.
        .filter((b) => b.enmax_acdnpinned || !dismissed.has(b.enmax_autocadbroadcastid))
        // Pinned first, then by severity (Critical → Info).
        .sort(
          (a, b) =>
            Number(b.enmax_acdnpinned ?? false) - Number(a.enmax_acdnpinned ?? false) ||
            severityRank(b.enmax_acdnseverity) - severityRank(a.enmax_acdnseverity),
        )
        .map((b) => ({
          id: b.enmax_autocadbroadcastid,
          title: b.enmax_acdntitle ?? "",
          body: b.enmax_acdnbody ?? "",
          severity: b.enmax_acdnseverity ?? 1,
          pinned: b.enmax_acdnpinned ?? false,
          requiresAck: b.enmax_acdnrequiresack ?? false,
        }));
    },
    refetchOnWindowFocus: true,
  });
}

// ── Number-sequence health (admin): sequences nearing/at the limit ──
export interface SequenceHealth {
  key: string;
  lastIssued: number;
  status: number; // 2=Warning, 3=Critical, 4=Exhausted
}

export function useSequenceHealth(enabled: boolean) {
  return useQuery<SequenceHealth[]>({
    queryKey: ["home-sequence-health"],
    enabled,
    queryFn: async () => {
      const res = await Enmax_autocadnumbersequencesService.getAll({
        filter: "enmax_acdnstatus eq 2 or enmax_acdnstatus eq 3 or enmax_acdnstatus eq 4",
        select: ["enmax_autocadnumbersequenceid", "enmax_acdnsequencekey", "enmax_acdnlastissued", "enmax_acdnstatus"],
        orderBy: ["enmax_acdnstatus desc"],
      });
      return (res.data ?? []).map((s) => ({
        key: (s.enmax_acdnsequencekey as string | undefined) ?? "",
        lastIssued: (s.enmax_acdnlastissued as number | undefined) ?? 0,
        status: (s.enmax_acdnstatus as number | undefined) ?? 1,
      }));
    },
    refetchOnWindowFocus: true,
  });
}

// ── Dismiss / acknowledge a broadcast (writes a BroadcastDismissal row) ──
export function useDismissBroadcast() {
  const qc = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  return useMutation({
    mutationFn: async ({ broadcastId, acknowledged }: { broadcastId: string; acknowledged: boolean }) => {
      const body = {
        "enmax_acdnBroadcast@odata.bind": `/enmax_autocadbroadcasts(${broadcastId})`,
        "enmax_acdnUser@odata.bind": `/systemusers(${currentUser?.id ?? ""})`,
        enmax_acdnacknowledged: acknowledged,
        enmax_acdndismissedon: new Date().toISOString(),
      };
      await Enmax_autocadbroadcastdismissalsService.create(
        body as unknown as Parameters<typeof Enmax_autocadbroadcastdismissalsService.create>[0],
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["home-broadcasts"] });
      void qc.invalidateQueries({ queryKey: ["notification-feed"] });
    },
  });
}
