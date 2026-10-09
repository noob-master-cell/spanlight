import { API_PREFIX, api } from "./client";
import { projectPath } from "./paths";
import type { TimeWindow } from "./projects";
import type { Price, UnpricedModel } from "./types";

export const pricesApi = {
  /** The price table the server computes costs from. */
  list: (): Promise<Price[]> => api.get<Price[]>(`${API_PREFIX}/prices`),
  /** Models with LLM calls in the window that no price covered, most-called first. */
  unpricedModels: (projectId: string, window: TimeWindow): Promise<UnpricedModel[]> =>
    api.get<UnpricedModel[]>(`${projectPath(projectId)}/unpriced-models`, { ...window }),
};
