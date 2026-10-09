import { useQuery } from "@tanstack/react-query";

import { projectsApi, queryKeys } from "@/lib/api";

import { firstTraceWindow } from "./first-trace";

export const POLL_INTERVAL_MS = 2000;

/**
 * Polls the onboarding endpoint every 2 s until the project's first trace arrives. Polling
 * pauses while the tab is hidden (React Query's default) and stops for good once `has_traces`
 * is true. Pass null to disable it (before step 3).
 */
export function useOnboardingStatus(projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.project(projectId ?? "").onboarding,
    queryFn: () => projectsApi.onboarding(projectId ?? ""),
    enabled: projectId !== null,
    refetchInterval: (query) => (query.state.data?.has_traces ? false : POLL_INTERVAL_MS),
  });
}

/**
 * Loads the project's first trace once (name, duration and cost for the success card). Resolves
 * to null when the trace can't be found in its window.
 */
export function useFirstTrace(projectId: string, firstTraceAt: string | null) {
  const range = firstTraceAt ? firstTraceWindow(firstTraceAt) : null;
  const query = { from: range?.from ?? "", to: range?.to ?? "", limit: 1 };
  return useQuery({
    queryKey: queryKeys.project(projectId).traces(query),
    queryFn: () => projectsApi.traces(projectId, query),
    enabled: range !== null,
    staleTime: Infinity,
    select: (page) => page.items[0] ?? null,
  });
}
