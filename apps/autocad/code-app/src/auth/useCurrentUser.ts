import { useQuery } from "@tanstack/react-query";
import { getContext } from "@microsoft/power-apps/app";
import { WhoAmIService } from "../generated/services/WhoAmIService";

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
  return {
    id: userId,
    azureObjectId: context.user.objectId ?? "",
    userPrincipalName: context.user.userPrincipalName ?? "",
    displayName: context.user.fullName ?? "",
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
