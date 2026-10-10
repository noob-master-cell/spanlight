import { api } from "./client";
import { projectPath } from "./paths";
import type { Comparison, ReleaseCompareQuery, ReleaseListQuery, ReleaseStats } from "./types";

function releasesPath(projectId: string): string {
  return `${projectPath(projectId)}/releases`;
}

/**
 * Releases seen in a window and how two of them differ. Reads need `project:read`. Errors: `422
 * RELEASE_WINDOW_TOO_LARGE` (a window over 30 days), `422 SAME_RELEASE`, `404 UNKNOWN_RELEASE`.
 */
export const releasesApi = {
  /** The release seen last first, at most 200. */
  list: (projectId: string, query: ReleaseListQuery = {}): Promise<ReleaseStats[]> =>
    api.get<ReleaseStats[]>(releasesPath(projectId), { ...query }),
  /** `a` is the baseline, `b` the candidate; deltas are `b - a`. */
  compare: (projectId: string, query: ReleaseCompareQuery): Promise<Comparison> =>
    api.get<Comparison>(`${releasesPath(projectId)}/compare`, { ...query }),
};
