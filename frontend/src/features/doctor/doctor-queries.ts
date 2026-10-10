import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useProjectParams } from "@/features/shell";
import { insightsApi, queryKeys, type MuteInput } from "@/lib/api";

import type { InsightQuery } from "./insight-filters";

/*
 * Reads and writes for the Doctor list and the insight detail page. The detectors run every
 * 15 minutes, so a minute of polling is plenty.
 */

const REFRESH_MS = 60_000;

/**
 * One page of insights for a query (no cursor): trace badges, summaries. `retry: false` suits
 * callers for which the list is only a hint.
 */
export function useProjectInsights(query: InsightQuery, options: { retry?: boolean } = {}) {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).insights(query),
    queryFn: () => insightsApi.list(projectId, query),
    refetchInterval: REFRESH_MS,
    ...options,
  });
}

/** The Doctor list: pages of insights, most recently seen first ("Load more"). */
export function useInsightPages(query: InsightQuery) {
  const { projectId } = useProjectParams();
  return useInfiniteQuery({
    // Distinct from `useProjectInsights`' key: the cached data has a different shape.
    queryKey: [...queryKeys.project(projectId).insights(query), "pages"] as const,
    queryFn: ({ pageParam }) => insightsApi.list(projectId, { ...query, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    refetchInterval: REFRESH_MS,
  });
}

/** The newest detector run: when the Doctor last checked. `undefined` data means no run yet. */
export function useLastDetectorRun() {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).detectorRuns,
    queryFn: () => insightsApi.detectorRuns(projectId, 1),
    select: (runs) => runs[0] ?? null,
    refetchInterval: REFRESH_MS,
  });
}

/** Whether the project has any insight at all, in any status (one row is enough to know). */
export function useHasAnyInsight(enabled: boolean) {
  const { projectId } = useProjectParams();
  const query = { limit: 1 } as const;
  return useQuery({
    queryKey: queryKeys.project(projectId).insights(query),
    queryFn: () => insightsApi.list(projectId, query),
    select: (page) => page.items.length > 0,
    enabled,
  });
}

export function useInsightQuery(insightId: string) {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).insight(insightId),
    queryFn: () => insightsApi.get(projectId, insightId),
    // A page that never loaded (removed insight) is not polled; "Try again" refetches.
    refetchInterval: (query) => (query.state.data === undefined ? false : REFRESH_MS),
  });
}

/** Every Doctor query of the project (list, detail, summary, health) changes with an action. */
function useInvalidateDoctor() {
  const { projectId } = useProjectParams();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId).doctor });
}

/**
 * The caller reports errors: inline next to the buttons. Every mutation refetches the Doctor
 * queries even when it fails, so a 409 INVALID_TRANSITION leaves the page on the latest status.
 */
export function useAcknowledgeInsight(insightId: string) {
  const { projectId } = useProjectParams();
  const invalidate = useInvalidateDoctor();
  return useMutation({
    mutationFn: () => insightsApi.acknowledge(projectId, insightId),
    onSettled: invalidate,
  });
}

export function useResolveInsight(insightId: string) {
  const { projectId } = useProjectParams();
  const invalidate = useInvalidateDoctor();
  return useMutation({
    mutationFn: () => insightsApi.resolve(projectId, insightId),
    onSettled: invalidate,
  });
}

export function useUnmuteInsight(insightId: string) {
  const { projectId } = useProjectParams();
  const invalidate = useInvalidateDoctor();
  return useMutation({
    mutationFn: () => insightsApi.unmute(projectId, insightId),
    onSettled: invalidate,
  });
}

export function useMuteInsight(insightId: string) {
  const { projectId } = useProjectParams();
  const invalidate = useInvalidateDoctor();
  return useMutation({
    mutationFn: (input: MuteInput) => insightsApi.mute(projectId, insightId, input),
    onSettled: invalidate,
  });
}

/** Spends the org's monthly explain budget; a stored explanation then shows on the detail page. */
export function useExplainInsight(insightId: string) {
  const { projectId } = useProjectParams();
  const invalidate = useInvalidateDoctor();
  return useMutation({
    mutationFn: () => insightsApi.explain(projectId, insightId),
    onSettled: invalidate,
  });
}
