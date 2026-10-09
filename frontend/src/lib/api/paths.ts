import { API_PREFIX } from "./client";

/** `/api/v1/orgs/{orgId}`, the root every org-scoped route hangs off. */
export function orgPath(orgId: string): string {
  return `${API_PREFIX}/orgs/${encodeURIComponent(orgId)}`;
}

/** `/api/v1/projects/{projectId}`, the root every project-scoped route hangs off. */
export function projectPath(projectId: string): string {
  return `${API_PREFIX}/projects/${encodeURIComponent(projectId)}`;
}
