import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { errorMessage, queryKeys, securityApi, type OAuthProvider } from "@/lib/api";

/** Whether two-factor authentication is on, since when, and how many recovery codes are left. */
export function useTotpStatusQuery() {
  return useQuery({ queryKey: queryKeys.totp, queryFn: securityApi.totpStatus });
}

export function useOAuthIdentitiesQuery() {
  return useQuery({ queryKey: queryKeys.oauthIdentities, queryFn: securityApi.oauthIdentities });
}

/** The providers this server has set up: the only ones the page offers. */
export function useOAuthProvidersQuery() {
  return useQuery({
    queryKey: queryKeys.oauthProviders,
    queryFn: securityApi.oauthProviders,
    staleTime: 5 * 60_000,
  });
}

/** Disconnects a provider. `409 LAST_SIGN_IN_METHOD` means the page was out of date: it reloads. */
export function useUnlinkOAuth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: OAuthProvider) => securityApi.unlinkOAuth(provider),
    onError: (error) => {
      toast.error(errorMessage(error));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.oauthIdentities });
    },
  });
}
