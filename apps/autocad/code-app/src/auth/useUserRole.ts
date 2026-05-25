import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "./useCurrentUser";
import { useAppConfig } from "../config/useAppConfig";
import { TeamsService } from "../generated/services/TeamsService";
import { SystemusersService } from "../generated/services/SystemusersService";
import { isGuid } from "../lib/guid";

export type Role = "Admin" | "Approver" | "User" | "Unknown";

async function fetchRole(
  userId: string,
  adminTeamId?: string,
  userTeamId?: string,
  approverTeamId?: string,
): Promise<Role> {
  // userId and team ids are interpolated into OData filters — only proceed with
  // validated GUIDs so a malformed value can't alter the role query.
  if (!isGuid(userId)) {
    console.warn("[UserRole] invalid userId; defaulting to Unknown:", userId);
    return "Unknown";
  }
  const configuredIds = [adminTeamId, approverTeamId, userTeamId].filter(isGuid);
  const teamIdClauses = configuredIds.map((id) => `teamid eq '${id}'`).join(" or ");

  const [teamsResult, sysRoleResult] = await Promise.allSettled([
    configuredIds.length > 0
      ? TeamsService.getAll({
          filter: `(${teamIdClauses}) and teammembership_association/any(m: m/systemuserid eq '${userId}')`,
          select: ["teamid"],
        })
      : Promise.resolve({ success: true as const, data: [] }),
    // System Administrator and System Customizer grant Admin access
    // regardless of team membership.
    SystemusersService.getAll({
      filter:
        `systemuserid eq '${userId}'` +
        ` and systemuserroles_association/any(r: r/name eq 'System Administrator' or r/name eq 'System Customizer')`,
      select: ["systemuserid"],
    }),
  ]);

  if (
    sysRoleResult.status === "fulfilled" &&
    sysRoleResult.value.success &&
    sysRoleResult.value.data?.length
  ) {
    return "Admin";
  }

  const teamData =
    teamsResult.status === "fulfilled" && teamsResult.value.success
      ? (teamsResult.value.data ?? [])
      : [];
  const teamIds = new Set(teamData.map((t) => t.teamid));

  if (adminTeamId && teamIds.has(adminTeamId))       return "Admin";
  if (approverTeamId && teamIds.has(approverTeamId)) return "Approver";
  if (userTeamId && teamIds.has(userTeamId))         return "User";
  return "Unknown";
}

export function useUserRole(): { role: Role; isPending: boolean } {
  const { data: user, isPending: userPending } = useCurrentUser();
  const config = useAppConfig();
  const { data: role, isPending: rolePending } = useQuery({
    queryKey: ["user-role", user?.id, config.AdminTeamId, config.UserTeamId, config.ApproverTeamId],
    enabled: !!user?.id,
    queryFn: () => fetchRole(user!.id, config.AdminTeamId, config.UserTeamId, config.ApproverTeamId),
    staleTime: 60 * 1000,
  });

  return { role: role ?? "Unknown", isPending: userPending || rolePending };
}
