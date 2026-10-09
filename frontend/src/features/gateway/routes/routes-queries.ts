import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useProjectParams } from "@/features/shell";
import { gatewayApi, isApiError, queryKeys, type Route, type RouteConfig } from "@/lib/api";

/*
 * The Routes page's and the route editor's own queries and mutations. The route list itself is
 * shared with other gateway pages (`useGatewayRoutesQuery` in `../gateway-queries`).
 */

export function useRouteQuery(routeId: string) {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).gateway.route(routeId),
    queryFn: () => gatewayApi.route(projectId, routeId),
    // A refetch while someone edits would move the form's base version under them; the editor
    // reloads on purpose instead ("Reload latest"), and a stale save gets a version conflict.
    refetchOnWindowFocus: false,
  });
}

export function useRouteVersionsQuery(routeId: string, enabled: boolean) {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).gateway.versions(routeId),
    queryFn: () => gatewayApi.routeVersions(projectId, routeId),
    enabled,
  });
}

/**
 * After any route write: store the route the server answered with, and refresh the list and the
 * version history.
 */
function useRouteSaved() {
  const { projectId } = useProjectParams();
  const queryClient = useQueryClient();
  return (route: Route) => {
    const keys = queryKeys.project(projectId).gateway;
    queryClient.setQueryData(keys.route(route.id), route);
    void queryClient.invalidateQueries({ queryKey: keys.routes });
    void queryClient.invalidateQueries({ queryKey: keys.versions(route.id) });
  };
}

export function useCreateRoute() {
  const { projectId } = useProjectParams();
  const saved = useRouteSaved();
  return useMutation({
    mutationFn: (input: { name: string; config: RouteConfig }) =>
      gatewayApi.createRoute(projectId, input),
    onSuccess: saved,
  });
}

export function useUpdateRoute(routeId: string) {
  const { projectId } = useProjectParams();
  const saved = useRouteSaved();
  return useMutation({
    mutationFn: (input: { config: RouteConfig; expected_version: number }) =>
      gatewayApi.updateRoute(projectId, routeId, input),
    onSuccess: saved,
  });
}

export function useRevertRoute(routeId: string) {
  const { projectId } = useProjectParams();
  const saved = useRouteSaved();
  return useMutation({
    mutationFn: (version: number) => gatewayApi.revertRoute(projectId, routeId, version),
    onSuccess: saved,
  });
}

/** Making a route the default unsets it on the old default, so the whole list is refetched. */
export function useSetDefaultRoute() {
  const { projectId } = useProjectParams();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (routeId: string) => gatewayApi.setDefaultRoute(projectId, routeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId).gateway.all });
    },
  });
}

export function useDeleteRoute() {
  const { projectId } = useProjectParams();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (routeId: string) => gatewayApi.deleteRoute(projectId, routeId),
    // The deleted route's own query is left alone: the editor that deleted it is still mounted
    // until it navigates away, and removing the query would refetch it into a 404 first.
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.project(projectId).gateway.routes,
      });
    },
  });
}

/** `409 ROUTE_VERSION_CONFLICT`: someone saved a newer version; `currentVersion` names it. */
export function isRouteVersionConflict(error: unknown): boolean {
  return isApiError(error) && error.code === "ROUTE_VERSION_CONFLICT";
}

export function isRouteInUse(error: unknown): boolean {
  return isApiError(error) && error.code === "ROUTE_IN_USE";
}

export function isRouteNameTaken(error: unknown): boolean {
  return isApiError(error) && error.code === "ROUTE_NAME_TAKEN";
}
