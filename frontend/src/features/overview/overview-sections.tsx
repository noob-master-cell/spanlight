import {
  CallsErrorsChart,
  CallsErrorsChartError,
  CallsErrorsChartSkeleton,
} from "./calls-errors-chart";
import { toChartPoints } from "./chart-data";
import { shortRangeLabel } from "./hero";
import { LatestTraces, LatestTracesError, LatestTracesSkeleton } from "./latest-traces";
import { ModelTable, ModelTableError, ModelTableSkeleton } from "./model-table";
import { RecentErrors, RecentErrorsError, RecentErrorsSkeleton } from "./recent-errors";
import type { OverviewQueries } from "./use-overview-queries";

interface SectionProps {
  queries: OverviewQueries;
  now: Date;
  className?: string;
}

export function CallsSection({ queries, now, className }: SectionProps) {
  const { timeseries, bucket, range } = queries;
  if (timeseries.isPending) {
    return <CallsErrorsChartSkeleton className={className} />;
  }
  if (timeseries.isError) {
    return (
      <CallsErrorsChartError
        className={className}
        error={timeseries.error}
        onRetry={() => {
          void timeseries.refetch();
        }}
      />
    );
  }
  return (
    <CallsErrorsChart
      className={className}
      points={toChartPoints(timeseries.data)}
      bucket={bucket}
      rangeLabel={shortRangeLabel(range)}
      isRefreshing={timeseries.isPlaceholderData}
      now={now}
    />
  );
}

export function LatestTracesSection({ queries, now }: SectionProps) {
  const { latestTraces, isLive } = queries;
  if (latestTraces.isPending) {
    return <LatestTracesSkeleton />;
  }
  if (latestTraces.isError) {
    return (
      <LatestTracesError
        error={latestTraces.error}
        onRetry={() => {
          void latestTraces.refetch();
        }}
      />
    );
  }
  return (
    <LatestTraces
      traces={latestTraces.data.items}
      isLive={isLive}
      isRefreshing={latestTraces.isPlaceholderData}
      now={now}
    />
  );
}

export function RecentErrorsSection({ queries, now }: SectionProps) {
  const { recentErrors } = queries;
  if (recentErrors.isPending) {
    return <RecentErrorsSkeleton />;
  }
  if (recentErrors.isError) {
    return (
      <RecentErrorsError
        error={recentErrors.error}
        onRetry={() => {
          void recentErrors.refetch();
        }}
      />
    );
  }
  return (
    <RecentErrors
      traces={recentErrors.data.items}
      hasMore={recentErrors.data.next_cursor !== null}
      isRefreshing={recentErrors.isPlaceholderData}
      now={now}
    />
  );
}

export function ModelsSection({ queries }: { queries: OverviewQueries }) {
  const { models } = queries;
  if (models.isPending) {
    return <ModelTableSkeleton />;
  }
  if (models.isError) {
    return (
      <ModelTableError
        error={models.error}
        onRetry={() => {
          void models.refetch();
        }}
      />
    );
  }
  return <ModelTable models={models.data} isRefreshing={models.isPlaceholderData} />;
}
