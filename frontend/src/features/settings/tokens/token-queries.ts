import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { errorMessage, queryKeys, tokensApi, type CreateTokenInput } from "@/lib/api";
import { useUncachedAction } from "@/lib/use-uncached-action";

/** The person's usable tokens: revoked and expired ones are not listed by the server. */
export function useTokensQuery() {
  return useQuery({
    queryKey: queryKeys.authTokens,
    queryFn: () => tokensApi.list(),
  });
}

/**
 * Creating a token returns the whole secret once. It goes through `useUncachedAction`, not a
 * mutation, because a mutation keeps its result in the query client's cache; the caller keeps the
 * result in its own state and drops it when the dialog closes.
 */
export function useCreateToken() {
  const queryClient = useQueryClient();
  return useUncachedAction(async (input: CreateTokenInput) => {
    const created = await tokensApi.create(input);
    void queryClient.invalidateQueries({ queryKey: queryKeys.authTokens });
    return created;
  });
}

export function useRevokeToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => tokensApi.revoke(tokenId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.authTokens });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}
