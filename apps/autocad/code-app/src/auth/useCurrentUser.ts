import { useQuery } from "@tanstack/react-query";
import { getContext } from "@microsoft/power-apps/app";
import { WhoAmIService } from "../generated/services/WhoAmIService";
import { SystemusersService } from "../generated/services/SystemusersService";

async function fetchCurrentUser() {
  const [context, whoAmI] = await Promise.all([
    getContext(),
    WhoAmIService.WhoAmI(),
  ]);
  if (!whoAmI.success || !whoAmI.data) {
    throw new Error("WhoAmI fetch failed");
  }
  const userId = whoAmI.data["UserId"];
  if (typeof userId !== "string" || !userId) {
    throw new Error("WhoAmI response missing UserId");
  }

  let displayName = context.user.fullName ?? "";
  let jobTitle: string | undefined;
  try {
    const sys = await SystemusersService.getAll({
      select: ["systemuserid", "fullname", "jobtitle"],
      filter: `systemuserid eq '${userId}'`,
    });
    const row = sys.data?.[0];
    if (row?.fullname) displayName = row.fullname;
    jobTitle = row?.jobtitle ?? undefined;
  } catch { /* non-fatal — greeting falls back to host context name */ }

  return {
    id: userId,
    azureObjectId: context.user.objectId ?? "",
    userPrincipalName: context.user.userPrincipalName ?? "",
    displayName,
    jobTitle,
    appId: context.app.appId ?? "",
    environmentId: context.app.environmentId ?? "",
    tenantId: context.user.tenantId ?? "",
  };
}

export type CurrentUser = Awaited<ReturnType<typeof fetchCurrentUser>>;

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
