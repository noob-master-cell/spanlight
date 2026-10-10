import type { AlertEventQuery, AlertRulePreviewInput } from "./alerts-types";
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
      credentials: [...all, "credentials"] as const,
      priceOverrides: [...all, "price-overrides"] as const,
      alertChannels: [...all, "alert-channels"] as const,
      /** The delivery log of one channel; filters ride in the key. */
      deliveries: (channelId: string, filters: { status?: string | undefined } = {}) =>
        [...all, "alert-channels", channelId, "deliveries", filters] as const,
    };
  },

  project: (projectId: string) => {
    const all = ["project", projectId] as const;
    const gateway = [...all, "gateway"] as const;
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
      alertRules: [...all, "alert-rules"] as const,
      alertRule: (ruleId: string) => [...all, "alert-rules", ruleId] as const,
      /** Every rule's event timeline: invalidate with this. */
      alertEventsAll: [...all, "alert-events"] as const,
      alertEvents: (query: Omit<AlertEventQuery, "cursor">) =>
        [...all, "alert-events", query] as const,
      alertPreview: (spec: AlertRulePreviewInput) => [...all, "alert-preview", spec] as const,
      budgets: [...all, "budgets"] as const,
      gateway: {
        /** Every gateway query of the project: invalidate with this. */
        all: gateway,
        overview: (query: MetricsQuery) => [...gateway, "overview", query] as const,
        keys: [...gateway, "keys"] as const,
        routes: [...gateway, "routes"] as const,
        route: (routeId: string) => [...gateway, "route", routeId] as const,
        versions: (routeId: string) => [...gateway, "route", routeId, "versions"] as const,
        faultProfiles: [...gateway, "fault-profiles"] as const,
      },
    };
  },
};
