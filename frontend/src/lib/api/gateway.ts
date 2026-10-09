import { api } from "./client";
import { projectPath } from "./paths";
import type { MetricsQuery } from "./projects";
import type {
  CreatedGatewayKey,
  FaultProfile,
  FaultProfileCreate,
  FaultProfileUpdate,
  GatewayKey,
  GatewayKeyCreate,
  GatewayKeyUpdate,
  GatewayOverview,
  Route,
  RouteCreate,
  RouteUpdate,
  RouteVersion,
} from "./types";

function gatewayPath(projectId: string): string {
  return `${projectPath(projectId)}/gateway`;
}

function routePath(projectId: string, routeId: string): string {
  return `${gatewayPath(projectId)}/routes/${encodeURIComponent(routeId)}`;
}

/** The gateway's routes under `/projects/{id}/gateway`. Writes need `gateway:write` (admin). */
export const gatewayApi = {
  /** A window of at most 7 days; the server rejects a longer one. */
  overview: (projectId: string, query: MetricsQuery): Promise<GatewayOverview> =>
    api.get<GatewayOverview>(`${gatewayPath(projectId)}/overview`, { ...query }),

  keys: (projectId: string): Promise<GatewayKey[]> =>
    api.get<GatewayKey[]>(`${gatewayPath(projectId)}/keys`),
  /** The answer carries the key's secret, once. */
  createKey: (projectId: string, input: GatewayKeyCreate): Promise<CreatedGatewayKey> =>
    api.post<CreatedGatewayKey>(`${gatewayPath(projectId)}/keys`, input),
  updateKey: (projectId: string, keyId: string, update: GatewayKeyUpdate): Promise<GatewayKey> =>
    api.patch<GatewayKey>(`${gatewayPath(projectId)}/keys/${encodeURIComponent(keyId)}`, update),
  revokeKey: (projectId: string, keyId: string): Promise<void> =>
    api.delete(`${gatewayPath(projectId)}/keys/${encodeURIComponent(keyId)}`),

  routes: (projectId: string): Promise<Route[]> =>
    api.get<Route[]>(`${gatewayPath(projectId)}/routes`),
  route: (projectId: string, routeId: string): Promise<Route> =>
    api.get<Route>(routePath(projectId, routeId)),
  createRoute: (projectId: string, input: RouteCreate): Promise<Route> =>
    api.post<Route>(`${gatewayPath(projectId)}/routes`, input),
  /** `409 ROUTE_VERSION_CONFLICT` (with `ApiError.currentVersion`) when `expected_version` is stale. */
  updateRoute: (projectId: string, routeId: string, update: RouteUpdate): Promise<Route> =>
    api.put<Route>(routePath(projectId, routeId), update),
  /** `409 ROUTE_IN_USE` while a gateway key points at the route. */
  deleteRoute: (projectId: string, routeId: string): Promise<void> =>
    api.delete(routePath(projectId, routeId)),
  routeVersions: (projectId: string, routeId: string): Promise<RouteVersion[]> =>
    api.get<RouteVersion[]>(`${routePath(projectId, routeId)}/versions`),
  /** Saves the config of an earlier version as a new version. */
  revertRoute: (projectId: string, routeId: string, version: number): Promise<Route> =>
    api.post<Route>(`${routePath(projectId, routeId)}/revert`, { version }),
  setDefaultRoute: (projectId: string, routeId: string): Promise<Route> =>
    api.post<Route>(`${routePath(projectId, routeId)}/default`),

  faultProfiles: (projectId: string): Promise<FaultProfile[]> =>
    api.get<FaultProfile[]>(`${gatewayPath(projectId)}/fault-profiles`),
  createFaultProfile: (projectId: string, input: FaultProfileCreate): Promise<FaultProfile> =>
    api.post<FaultProfile>(`${gatewayPath(projectId)}/fault-profiles`, input),
  updateFaultProfile: (
    projectId: string,
    profileId: string,
    update: FaultProfileUpdate,
  ): Promise<FaultProfile> =>
    api.patch<FaultProfile>(
      `${gatewayPath(projectId)}/fault-profiles/${encodeURIComponent(profileId)}`,
      update,
    ),
  deleteFaultProfile: (projectId: string, profileId: string): Promise<void> =>
    api.delete(`${gatewayPath(projectId)}/fault-profiles/${encodeURIComponent(profileId)}`),

  /** Empties the project's response cache. */
  purgeCache: (projectId: string): Promise<void> =>
    api.post<undefined>(`${gatewayPath(projectId)}/cache/purge`),
};
