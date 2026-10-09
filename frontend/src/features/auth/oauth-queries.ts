import { useQuery } from "@tanstack/react-query";

import { queryKeys, securityApi } from "@/lib/api";

/**
 * The providers this server has set up. Sign-in screens show a button only for these, so a server
 * without GitHub or Google shows none. The list changes with the operator's settings, not with use.
 */
export function useOAuthProviders() {
  return useQuery({
    queryKey: queryKeys.oauthProviders,
    queryFn: securityApi.oauthProviders,
    staleTime: 5 * 60_000,
    // A failure shows nothing and the password form is still there: no point retrying in the open.
    retry: false,
  });
}
