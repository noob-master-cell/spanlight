import type { AuditFilters } from "./orgs";
import type { MetricsQuery, SessionListQuery, TimeWindow, TraceListQuery } from "./projects";
import type { Bucket } from "./types";

/**
 * Query key factory. Every key starts with a stable scope so related queries
 * can be invalidated together, e.g. `queryKeys.project(id).all`.
 */
export const queryKeys = {
  me: ["me"] as const,
  authSessions: ["auth", "sessions"] as const,
  authTokens: ["auth", "tokens"] as const,
  totp: ["auth", "totp"] as const,
  oauthProviders: ["auth", "oauth", "providers"] as const,
  oauthIdentities: ["auth", "oauth", "identities"] as const,
  prices: ["prices"] as const,
  invitePreview: (token: string) => ["invite", "preview", token] as const,

  org: (orgId: string) => {
    const all = ["org", orgId] as const;
    const audit = [...all, "audit"] as const;
    return {
      all,
      detail: [...all, "detail"] as const,
      projects: [...all, "projects"] as const,
      members: [...all, "members"] as const,
      invites: [...all, "invites"] as const,
      /** Every audit query of the org: invalidate with this, read one with `auditEvents`. */
      audit,
      auditEvents: (filters: AuditFilters) => [...audit, filters] as const,
    };
  },

  project: (projectId: string) => {
    const all = ["project", projectId] as const;
    return {
      all,
      detail: [...all, "detail"] as const,
      keys: [...all, "keys"] as const,
      exports: [...all, "exports"] as const,
      export: (exportId: string) => [...all, "export", exportId] as const,
      unpricedModels: (window: TimeWindow) => [...all, "unpriced-models", window] as const,
      onboarding: [...all, "onboarding"] as const,
      filters: [...all, "filters"] as const,
      traces: (query: Omit<TraceListQuery, "cursor">) => [...all, "traces", query] as const,
      trace: (traceId: string) => [...all, "trace", traceId] as const,
      sessions: (query: Omit<SessionListQuery, "cursor">) => [...all, "sessions", query] as const,
      overview: (query: MetricsQuery) => [...all, "overview", query] as const,
      timeseries: (query: MetricsQuery & { bucket: Bucket }) =>
        [...all, "timeseries", query] as const,
      models: (query: MetricsQuery) => [...all, "models", query] as const,
    };
  },
};
