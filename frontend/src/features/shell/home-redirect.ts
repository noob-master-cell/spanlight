import type { QueryClient } from "@tanstack/react-query";

import { orgsApi, queryKeys, type Me } from "@/lib/api";
import { readLastProject } from "@/lib/last-project";

type HomeDestination =
  | { to: "/onboarding"; search: { org?: string } }
  | { to: "/$orgId/$projectId/overview"; params: { orgId: string; projectId: string } };

/**
 * Where "/" should send a signed-in user: their last project if they still
 * have access, otherwise the first project of their first org, otherwise
 * onboarding.
 */
export async function resolveHomeDestination(
  queryClient: QueryClient,
  me: Me,
): Promise<HomeDestination> {
  if (me.memberships.length === 0) {
    return { to: "/onboarding", search: {} };
  }

  const last = readLastProject();
  const orgIds = me.memberships.map((membership) => membership.org.id);
  const orderedOrgIds =
    last && orgIds.includes(last.orgId)
      ? [last.orgId, ...orgIds.filter((id) => id !== last.orgId)]
      : orgIds;

  for (const orgId of orderedOrgIds) {
    const projects = await queryClient.query({
      queryKey: queryKeys.org(orgId).projects,
      queryFn: () => orgsApi.projects(orgId),
      staleTime: "static",
    });
    const preferred = projects.find((project) => project.id === last?.projectId) ?? projects[0];
    if (preferred) {
      return {
        to: "/$orgId/$projectId/overview",
        params: { orgId, projectId: preferred.id },
      };
    }
  }

  return { to: "/onboarding", search: { org: orderedOrgIds[0] } };
}
