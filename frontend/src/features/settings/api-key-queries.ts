import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useProjectParams } from "@/features/shell";
import { errorMessage, projectsApi, queryKeys, type CreateApiKeyInput } from "@/lib/api";
import { useUncachedAction } from "@/lib/use-uncached-action";

export function useApiKeysQuery() {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).keys,
    queryFn: () => projectsApi.keys(projectId),
  });
}

/**
 * Creating a key returns its secret once. It goes through `useUncachedAction`, not a mutation,
 * because a mutation keeps its result in the query client's cache; the dialog keeps the result in
 * its own state and drops it when it closes.
 */
export function useCreateApiKey() {
  const { projectId } = useProjectParams();
  const queryClient = useQueryClient();
  return useUncachedAction(async (input: CreateApiKeyInput) => {
    const created = await projectsApi.createKey(projectId, input);
    void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId).keys });
    return created;
  });
}

export function useRevokeApiKey() {
  const { projectId } = useProjectParams();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => projectsApi.revokeKey(projectId, keyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId).keys });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}
