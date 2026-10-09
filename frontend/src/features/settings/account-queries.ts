import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { authApi, errorMessage, queryKeys } from "@/lib/api";

export function useAuthSessionsQuery() {
  return useQuery({
    queryKey: queryKeys.authSessions,
    queryFn: authApi.sessions,
  });
}

export function useRevokeAuthSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.authSessions });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}

/** Sign out everywhere else: ends every session except the one making the call. */
export function useRevokeOtherAuthSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.revokeOtherSessions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.authSessions });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}
