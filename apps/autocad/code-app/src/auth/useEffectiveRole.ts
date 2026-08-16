import { useUiStore } from "../store/uiStore";
import { useUserRole, type Role } from "./useUserRole";

export function useEffectiveRole(): { role: Role; isPending: boolean } {
  const { role, isPending } = useUserRole();
  const viewAsEndUser = useUiStore(s => s.viewAsEndUser);

  if (viewAsEndUser && role === "Admin") {
    return { role: "User", isPending };
  }
  return { role, isPending };
}
