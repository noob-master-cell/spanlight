import { API_PREFIX, api } from "./client";
import type {
  ApiKey,
  Bucket,
  CreatedApiKey,
  FilterOptions,
  ModelMetrics,
  OnboardingStatus,
  OverviewMetrics,
  Page,
  Project,
  ProjectUpdate,
  SessionSummary,
  TimeseriesPoint,
  TraceDetail,
  TraceStatusFilter,
  TraceSummary,
} from "./types";

function projectPath(projectId: string): string {
  return `${API_PREFIX}/projects/${encodeURIComponent(projectId)}`;
}

/** Time window shared by every metrics/list query. ISO-8601 UTC strings. */
export interface TimeWindow {
  from: string;
  to: string;
}

export interface MetricsQuery extends TimeWindow {
  environment?: string | undefined;
}

export interface TraceListQuery extends TimeWindow {
  environment?: string | undefined;
  release?: string | undefined;
  model?: string | undefined;
  status?: TraceStatusFilter | undefined;
  user_id?: string | undefined;
  session_id?: string | undefined;
  tag?: string | undefined;
  q?: string | undefined;
  limit?: number | undefined;
  cursor?: string | null | undefined;
}

export interface SessionListQuery extends TimeWindow {
  limit?: number;
  cursor?: string | null;
}

export const projectsApi = {
  get: (projectId: string): Promise<Project> => api.get<Project>(projectPath(projectId)),
  update: (projectId: string, update: ProjectUpdate): Promise<Project> =>
    api.patch<Project>(projectPath(projectId), update),

  keys: (projectId: string): Promise<ApiKey[]> =>
    api.get<ApiKey[]>(`${projectPath(projectId)}/keys`),
  createKey: (projectId: string, name: string): Promise<CreatedApiKey> =>
    api.post<CreatedApiKey>(`${projectPath(projectId)}/keys`, { name }),
  revokeKey: (projectId: string, keyId: string): Promise<void> =>
    api.delete(`${projectPath(projectId)}/keys/${encodeURIComponent(keyId)}`),

  onboarding: (projectId: string): Promise<OnboardingStatus> =>
    api.get<OnboardingStatus>(`${projectPath(projectId)}/onboarding`),

  filters: (projectId: string): Promise<FilterOptions> =>
    api.get<FilterOptions>(`${projectPath(projectId)}/filters`),

  traces: (projectId: string, query: TraceListQuery): Promise<Page<TraceSummary>> =>
    api.get<Page<TraceSummary>>(`${projectPath(projectId)}/traces`, { ...query }),
  trace: (projectId: string, traceId: string): Promise<TraceDetail> =>
    api.get<TraceDetail>(`${projectPath(projectId)}/traces/${encodeURIComponent(traceId)}`),

  sessions: (projectId: string, query: SessionListQuery): Promise<Page<SessionSummary>> =>
    api.get<Page<SessionSummary>>(`${projectPath(projectId)}/sessions`, { ...query }),

  overview: (projectId: string, query: MetricsQuery): Promise<OverviewMetrics> =>
    api.get<OverviewMetrics>(`${projectPath(projectId)}/metrics/overview`, { ...query }),
  timeseries: (
    projectId: string,
    query: MetricsQuery & { bucket: Bucket },
  ): Promise<TimeseriesPoint[]> =>
    api.get<TimeseriesPoint[]>(`${projectPath(projectId)}/metrics/timeseries`, { ...query }),
  models: (projectId: string, query: MetricsQuery): Promise<ModelMetrics[]> =>
    api.get<ModelMetrics[]>(`${projectPath(projectId)}/metrics/models`, { ...query }),
};
