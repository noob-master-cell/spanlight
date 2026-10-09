import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useProjectParams } from "@/features/shell/project-context";
import { errorMessage, projectsApi, queryKeys } from "@/lib/api";

export function useApiKeysQuery() {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).keys,
    queryFn: () => projectsApi.keys(projectId),
  });
}

/** Creating a key returns its secret exactly once; the caller holds it in component state. */
export function useCreateApiKey() {
  const { projectId } = useProjectParams();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => projectsApi.createKey(projectId, name),
    // The response carries the secret. Drop it from the mutation cache as soon as it settles.
    gcTime: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId).keys });
    },
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
