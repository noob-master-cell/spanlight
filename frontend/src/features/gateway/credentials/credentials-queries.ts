import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useProjectParams } from "@/features/shell";
import { credentialsApi, queryKeys, type CredentialCreate } from "@/lib/api";
import { useUncachedAction } from "@/lib/use-uncached-action";

export { useCredentialsQuery } from "../gateway-queries";

function useInvalidateCredentials() {
  const { orgId } = useProjectParams();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).credentials });
}

/**
 * The request carries the provider key, so it runs through `useUncachedAction`: a mutation would
 * keep the key in the query client's mutation cache.
 */
export function useCreateCredential() {
  const { orgId } = useProjectParams();
  const invalidate = useInvalidateCredentials();
  return useUncachedAction(async (input: CredentialCreate) => {
    const created = await credentialsApi.create(orgId, input);
    void invalidate();
    return created;
  });
}

/** Same as creating: the new key must stay out of the mutation cache. */
export function useRotateCredential() {
  const { orgId } = useProjectParams();
  const invalidate = useInvalidateCredentials();
  return useUncachedAction(async (credentialId: string, apiKey: string) => {
    const rotated = await credentialsApi.rotate(orgId, credentialId, apiKey);
    void invalidate();
    return rotated;
  });
}

/** Calls the provider with the stored key. The server records the outcome on the credential. */
export function useCheckCredential() {
  const { orgId } = useProjectParams();
  const invalidate = useInvalidateCredentials();
  return useMutation({
    mutationFn: (credentialId: string) => credentialsApi.check(orgId, credentialId),
    onSettled: invalidate,
  });
}

export function useDeleteCredential() {
  const { orgId } = useProjectParams();
  const invalidate = useInvalidateCredentials();
  return useMutation({
    mutationFn: (credentialId: string) => credentialsApi.delete(orgId, credentialId),
    onSuccess: invalidate,
  });
}
