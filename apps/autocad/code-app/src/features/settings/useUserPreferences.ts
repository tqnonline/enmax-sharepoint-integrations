import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { Enmax_autocaduserpreferencesService } from "../../generated";

export interface UserPreferences {
  id: string | null;
  emailEnabled: boolean;
  teamsEnabled: boolean;
}

export function useUserPreferences() {
  const { data: user } = useCurrentUser();

  return useQuery<UserPreferences>({
    queryKey:     ["user-preferences", user?.id],
    enabled:      !!user?.id,
    throwOnError: false,
    queryFn: async () => {
      const result = await Enmax_autocaduserpreferencesService.getAll({
        filter: `_enmax_acdnuser_value eq '${user!.id}'`,
        select: ["enmax_autocaduserpreferenceid", "enmax_acdnemailenabled", "enmax_acdnteamsenabled"],
        top:    1,
      });
      const row = result.data?.[0];
      return {
        id:           row?.enmax_autocaduserpreferenceid ?? null,
        emailEnabled: row?.enmax_acdnemailenabled ?? true,
        teamsEnabled: row?.enmax_acdnteamsenabled ?? true,
      };
    },
  });
}

export function useSaveUserPreferences() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (prefs: UserPreferences) => {
      const fields = {
        enmax_acdnemailenabled: prefs.emailEnabled,
        enmax_acdnteamsenabled: prefs.teamsEnabled,
        _enmax_acdnuser_value: user?.id,
      };
      if (prefs.id) {
        await Enmax_autocaduserpreferencesService.update(prefs.id, fields as Parameters<typeof Enmax_autocaduserpreferencesService.update>[1]);
      } else {
        await Enmax_autocaduserpreferencesService.create(fields as unknown as Parameters<typeof Enmax_autocaduserpreferencesService.create>[0]);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-preferences"] }),
  });
}
