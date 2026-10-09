import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";

import { useMe } from "@/features/auth";
import { orgsApi, projectsApi, queryKeys, type Role } from "@/lib/api";
import { can, type Permission } from "@/lib/permissions";
import { resolveRange, type ResolvedRange } from "@/lib/time-range";

const projectRoute = getRouteApi("/_authed/$orgId/$projectId");

export function useProjectParams(): { orgId: string; projectId: string } {
  return projectRoute.useParams();
}

export function useProjectQuery() {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).detail,
    queryFn: () => projectsApi.get(projectId),
  });
}

export function useOrgProjectsQuery(orgId: string) {
  return useQuery({
    queryKey: queryKeys.org(orgId).projects,
    queryFn: () => orgsApi.projects(orgId),
  });
}

/** The signed-in user's role in the current org, from the cached `/me` response. */
export function useCurrentRole(): Role | null {
  const { orgId } = useProjectParams();
  const me = useMe();
  return me.memberships.find((membership) => membership.org.id === orgId)?.role ?? null;
}

export function useCurrentOrg() {
  const { orgId } = useProjectParams();
  const me = useMe();
  return me.memberships.find((membership) => membership.org.id === orgId)?.org ?? null;
}

export function usePermission(permission: Permission): boolean {
  return can(useCurrentRole(), permission);
}

export interface ProjectFilters {
  range: ResolvedRange;
  environment: string | undefined;
}

/** Time window and environment from the URL, shared by every project data page. */
export function useProjectFilters(): ProjectFilters {
  const search = projectRoute.useSearch();
  return {
    range: resolveRange(search),
    environment: search.env,
  };
}

export function useFilterOptionsQuery() {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).filters,
    queryFn: () => projectsApi.filters(projectId),
    staleTime: 5 * 60_000,
  });
}
