import { useQuery } from "@tanstack/react-query";

import { useProjectParams } from "@/features/shell";
import { credentialsApi, gatewayApi, queryKeys } from "@/lib/api";

/*
 * Only the queries more than one gateway page reads. A page's own queries and mutations live in
 * its folder.
 */

export function useGatewayKeysQuery() {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).gateway.keys,
    queryFn: () => gatewayApi.keys(projectId),
  });
}

export function useGatewayRoutesQuery() {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).gateway.routes,
    queryFn: () => gatewayApi.routes(projectId),
  });
}

export function useFaultProfilesQuery() {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).gateway.faultProfiles,
    queryFn: () => gatewayApi.faultProfiles(projectId),
  });
}

/** Readable by every member of the org; only managing credentials needs the owner. */
export function useCredentialsQuery() {
  const { orgId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.org(orgId).credentials,
    queryFn: () => credentialsApi.list(orgId),
  });
}
