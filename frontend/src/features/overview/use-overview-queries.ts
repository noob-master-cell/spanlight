import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useProjectFilters, useProjectParams } from "@/features/shell/project-context";
import { projectsApi, queryKeys, type MetricsQuery, type TraceListQuery } from "@/lib/api";
import { bucketFor, resolveRange } from "@/lib/time-range";

export const RECENT_ERRORS_LIMIT = 3;
export const LATEST_TRACES_LIMIT = 5;

/** How often the "Live" latest-traces list refreshes. */
export const LIVE_REFRESH_MS = 15_000;

/** How often the first-run screen checks whether the first trace has arrived. */
export const FIRST_TRACE_POLL_MS = 3_000;

/**
 * Every query the overview needs, keyed by the URL's time window and environment.
 * `keepPreviousData` holds the last render while a new range loads, so switching ranges dims
 * the page instead of flashing skeletons.
 */
export function useOverviewQueries() {
  const queryClient = useQueryClient();
  const { projectId } = useProjectParams();
  const { range, environment } = useProjectFilters();
  const keys = queryKeys.project(projectId);
  const metricsWindow: MetricsQuery = { from: range.from, to: range.to, environment };
  const bucket = bucketFor(range.durationMs);

  const overview = useQuery({
    queryKey: keys.overview(metricsWindow),
    queryFn: () => projectsApi.overview(projectId, metricsWindow),
    placeholderData: keepPreviousData,
  });

  const timeseries = useQuery({
    queryKey: keys.timeseries({ ...metricsWindow, bucket }),
    queryFn: () => projectsApi.timeseries(projectId, { ...metricsWindow, bucket }),
    placeholderData: keepPreviousData,
  });

  const models = useQuery({
    queryKey: keys.models(metricsWindow),
    queryFn: () => projectsApi.models(projectId, metricsWindow),
    placeholderData: keepPreviousData,
  });

  const errorsQuery: Omit<TraceListQuery, "cursor"> = {
    ...metricsWindow,
    status: "error",
    limit: RECENT_ERRORS_LIMIT,
  };
  const recentErrors = useQuery({
    queryKey: keys.traces(errorsQuery),
    queryFn: () => projectsApi.traces(projectId, errorsQuery),
    placeholderData: keepPreviousData,
  });

  // Preset windows end "now", so the latest traces poll and re-resolve the window on every
  // fetch: a trace sent a minute after the page loaded still shows up. Custom windows are
  // fixed in the past and fetched once.
  const isLive = range.value !== "custom";
  const latestTraces = useQuery({
    queryKey: [
      ...keys.all,
      "latest-traces",
      isLive
        ? { range: range.value, environment, limit: LATEST_TRACES_LIMIT }
        : { ...metricsWindow, limit: LATEST_TRACES_LIMIT },
    ],
    queryFn: () => {
      const window = isLive ? resolveRange({ range: range.value }) : range;
      return projectsApi.traces(projectId, {
        from: window.from,
        to: window.to,
        environment,
        limit: LATEST_TRACES_LIMIT,
      });
    },
    refetchInterval: isLive ? LIVE_REFRESH_MS : false,
    placeholderData: keepPreviousData,
  });

  // Only needed to tell "never sent a trace" apart from "nothing in this range". While the
  // project has no traces at all, keep checking so the first one replaces the setup screen.
  const rangeIsEmpty = overview.data?.current.traces === 0;
  const onboarding = useQuery({
    queryKey: keys.onboarding,
    queryFn: () => projectsApi.onboarding(projectId),
    enabled: rangeIsEmpty,
    refetchInterval: (query) =>
      query.state.data?.has_traces === false ? FIRST_TRACE_POLL_MS : false,
  });

  // The first trace just arrived: everything on the page is stale.
  const hasTraces = onboarding.data?.has_traces;
  const previousHasTraces = useRef(hasTraces);
  useEffect(() => {
    if (previousHasTraces.current === false && hasTraces === true) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId).all });
    }
    previousHasTraces.current = hasTraces;
  }, [hasTraces, projectId, queryClient]);

  return {
    range,
    environment,
    bucket,
    isLive,
    overview,
    timeseries,
    models,
    recentErrors,
    latestTraces,
    onboarding,
  };
}

export type OverviewQueries = ReturnType<typeof useOverviewQueries>;
