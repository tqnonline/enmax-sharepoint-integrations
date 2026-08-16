import { useMemo } from "react";
import { tokens, makeStyles } from "@fluentui/react-components";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { useUserRole } from "../../auth/useUserRole";
import { useAppConfig } from "../../config/useAppConfig";
import { usePendingReservations } from "../approvals/hooks/usePendingReservations";
import {
  useMyOpenCheckouts,
  useMyRecentReservations,
  usePendingCheckinCount,
  useHomeBroadcasts,
  useSequenceHealth,
} from "./useHomeData";
import { HomeHero } from "./HomeHero";
import { BroadcastCarousel } from "./BroadcastCarousel";
import { AttentionPanel } from "./AttentionPanel";
import { MyWorkCards } from "./MyWorkCards";
import { SystemHealthCard } from "./SystemHealthCard";

const FADE_UP = {
  from: { opacity: "0", transform: "translateY(8px)" },
  to: { opacity: "1", transform: "translateY(0)" },
};

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  section: {
    animationName: FADE_UP,
    animationDuration: "240ms",
    animationFillMode: "both",
    animationTimingFunction: "ease-out",
  },
});

export function HomePage() {
  const styles = useStyles();
  const { data: currentUser } = useCurrentUser();
  const { role } = useUserRole();
  const { StaleCheckoutMonths } = useAppConfig();

  const userId = currentUser?.id;
  const isApproverOrAdmin = role === "Approver" || role === "Admin";
  const isAdmin = role === "Admin";

  const checkoutsQ = useMyOpenCheckouts(userId);
  const reservationsQ = useMyRecentReservations(userId);
  const pendingResQ = usePendingReservations(1);
  const pendingChkQ = usePendingCheckinCount(isApproverOrAdmin);
  const broadcastsQ = useHomeBroadcasts(userId, role);
  const healthQ = useSequenceHealth(isAdmin);

  const checkouts = checkoutsQ.data ?? [];
  const reservations = reservationsQ.data ?? [];
  const pendingApprovals = isApproverOrAdmin ? (pendingResQ.data?.length ?? 0) : 0;
  const pendingCheckins = pendingChkQ.data ?? 0;

  const staleDays = useMemo(() => {
    const first = parseInt((StaleCheckoutMonths ?? "3").split(",")[0] ?? "3", 10);
    return (Number.isFinite(first) ? first : 3) * 30;
  }, [StaleCheckoutMonths]);
  const staleCheckouts = checkouts.filter((c) => c.daysOut >= staleDays);

  const pendingMyRes = reservations.filter((r) => r.status === 1).length;
  const statusLine = useMemo(() => {
    const parts: string[] = [];
    if (checkouts.length) parts.push(`${checkouts.length} open Check Out${checkouts.length !== 1 ? "s" : ""}`);
    if (pendingMyRes) parts.push(`${pendingMyRes} pending reservation${pendingMyRes !== 1 ? "s" : ""}`);
    if (isApproverOrAdmin && pendingApprovals) parts.push(`${pendingApprovals} awaiting your approval`);
    return parts.length ? parts.join(" · ") : "You have no open items right now — a calm day.";
  }, [checkouts.length, pendingMyRes, isApproverOrAdmin, pendingApprovals]);

  const delay = (i: number) => ({ animationDelay: `${i * 60}ms` });

  return (
    <div className={styles.page}>
      <div className={styles.section} style={delay(0)}>
        <HomeHero fullName={currentUser?.displayName} statusLine={statusLine} />
      </div>

      {broadcastsQ.data && broadcastsQ.data.length > 0 && (
        <div className={styles.section} style={delay(1)}>
          <BroadcastCarousel broadcasts={broadcastsQ.data} />
        </div>
      )}

      <div className={styles.section} style={delay(2)}>
        <AttentionPanel
          isApproverOrAdmin={isApproverOrAdmin}
          pendingApprovals={pendingApprovals}
          pendingCheckins={pendingCheckins}
          staleCheckouts={staleCheckouts}
        />
      </div>

      <div className={styles.section} style={delay(3)}>
        <MyWorkCards
          checkouts={checkouts}
          checkoutsLoading={checkoutsQ.isPending}
          reservations={reservations}
          reservationsLoading={reservationsQ.isPending}
        />
      </div>

      {isAdmin && (
        <div className={styles.section} style={delay(4)}>
          <SystemHealthCard sequences={healthQ.data ?? []} loading={healthQ.isPending} />
        </div>
      )}
    </div>
  );
}
