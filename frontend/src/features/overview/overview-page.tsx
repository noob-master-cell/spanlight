import type { UseQueryResult } from "@tanstack/react-query";

import { ErrorState } from "@/components/error-state";
import { Card } from "@/components/ui/card";
import { useMe } from "@/features/auth/queries";
import { useProjectQuery } from "@/features/shell/project-context";
import { describeRange } from "@/lib/time-range";
import { cn } from "@/lib/utils";

import {
  CallsErrorsChart,
  CallsErrorsChartError,
  CallsErrorsChartSkeleton,
} from "./calls-errors-chart";
import { toChartPoints, type ChartPoint } from "./chart-data";
import { FirstRun } from "./first-run";
import {
  errorCountFrom,
  formatHeroDate,
  greetingFor,
  heroStatus,
  joinEyebrow,
  shortRangeLabel,
  type HeroStatus,
} from "./hero";
import { KpiCards, KpiCardsSkeleton } from "./kpi-cards";
import { previousPeriodLabel } from "./kpis";
import { LatestTraces, LatestTracesError, LatestTracesSkeleton } from "./latest-traces";
import { ModelTable, ModelTableError, ModelTableSkeleton } from "./model-table";
import { OverviewHero } from "./overview-hero";
import { EmptyRangeState } from "./overview-empty-states";
import { RecentErrors, RecentErrorsError, RecentErrorsSkeleton } from "./recent-errors";
import { SpendCard, SpendCardSkeleton, type Loadable } from "./spend-card";
import { useOverviewQueries, type OverviewQueries } from "./use-overview-queries";

type PageState = "loading" | "error" | "first-run" | "empty-window" | "ready";

function pageStateOf({ overview, onboarding }: OverviewQueries): PageState {
  if (overview.isPending) {
    return "loading";
  }
  if (overview.isError) {
    return "error";
  }
  if (overview.data.current.traces > 0) {
    return "ready";
  }
  if (onboarding.isPending) {
    return "loading";
  }
  // If the onboarding check fails, assume the project has data elsewhere: suggesting a wider
  // range is harmless, a false "waiting for your first trace" is not.
  return onboarding.data?.has_traces === false ? "first-run" : "empty-window";
}

function statusFor(state: PageState, queries: OverviewQueries): HeroStatus | null {
  const current = queries.overview.data?.current;
  switch (state) {
    case "loading":
    case "error":
      return null;
    case "first-run":
      return heroStatus({ traces: 0, errors: 0, hasEverReceivedTraces: false });
    case "empty-window":
      return heroStatus({ traces: 0, errors: 0, hasEverReceivedTraces: true });
    case "ready":
      return heroStatus({
        traces: current?.traces ?? 0,
        errors: current ? (errorCountFrom(current.error_rate, current.llm_calls) ?? 0) : 0,
        hasEverReceivedTraces: true,
      });
  }
}

export function OverviewPage() {
  const queries = useOverviewQueries();
  const me = useMe();
  const project = useProjectQuery();
  const now = new Date();
  const state = pageStateOf(queries);
  const { range, environment } = queries;
  const environmentLabel = environment ?? "All environments";

  const date = formatHeroDate(now);
  const eyebrow =
    state === "first-run"
      ? {
          full: joinEyebrow([date, project.data?.name, environmentLabel]),
          compact: joinEyebrow([date, project.data?.name]),
        }
      : {
          full: joinEyebrow([date, environmentLabel, describeRange(range)]),
          compact: joinEyebrow([date, shortRangeLabel(range)]),
        };

  return (
    <div className="flex flex-col gap-8">
      <OverviewHero
        eyebrow={eyebrow}
        greeting={greetingFor(now, me.user.name)}
        status={statusFor(state, queries)}
        isLoading={state === "loading"}
        listeningEnvironment={environment ?? null}
      />
      <OverviewBody
        state={state}
        queries={queries}
        projectName={project.data?.name ?? null}
        now={now}
      />
      {/* Announce loading once for assistive tech; the skeletons themselves are aria-hidden. */}
      <p className="sr-only" role="status" aria-live="polite">
        {state === "loading" ? "Loading overview" : ""}
      </p>
    </div>
  );
}

interface OverviewBodyProps {
  state: PageState;
  queries: OverviewQueries;
  projectName: string | null;
  now: Date;
}

function OverviewBody({ state, queries, projectName, now }: OverviewBodyProps) {
  const { overview, range, environment } = queries;

  switch (state) {
    case "loading":
      return <OverviewSkeleton />;
    case "error":
      return (
        <Card>
          <ErrorState
            error={overview.error}
            title="Couldn't load the overview"
            onRetry={() => {
              void overview.refetch();
            }}
          />
        </Card>
      );
    case "first-run":
      return <FirstRun projectName={projectName} environment={environment} />;
    case "empty-window":
      return <EmptyRangeState range={range} environment={environment} />;
    case "ready":
      return <Dashboard queries={queries} now={now} />;
  }
}

/** Turns a query into what the Spend card renders: data, a loading state or a retry. */
function loadable<T, R>(query: UseQueryResult<T>, select: (data: T) => R): Loadable<R> {
  if (query.isPending) {
    return { status: "pending" };
  }
  if (query.isError) {
    return {
      status: "error",
      retry: () => {
        void query.refetch();
      },
    };
  }
  return { status: "success", data: select(query.data) };
}

/** The KPI cards' sparkline input: the points, null while loading, "error" when it failed. */
function sparklinePoints(points: Loadable<ChartPoint[]>): ChartPoint[] | null | "error" {
  switch (points.status) {
    case "success":
      return points.data;
    case "pending":
      return null;
    case "error":
      return "error";
  }
}

/* Desktop bento: the spend card beside the calls chart and KPI grid, then latest traces beside
 * recent errors, then models. Below xl everything stacks; on phones the KPI cards come before
 * the chart, as in the mobile design. */
const ROW_ONE = "grid gap-4 xl:grid-cols-[minmax(0,442fr)_minmax(0,626fr)]";
const ROW_TWO = "grid gap-4 xl:grid-cols-[minmax(0,717fr)_minmax(0,351fr)]";

function Dashboard({ queries, now }: { queries: OverviewQueries; now: Date }) {
  const { overview, timeseries, models, range, bucket } = queries;
  if (!overview.data) {
    return null;
  }
  const metrics = overview.data;
  const points = loadable(timeseries, toChartPoints);
  const dimMetrics = overview.isPlaceholderData ? "opacity-60" : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className={ROW_ONE}>
        <SpendCard
          className={cn("transition-opacity", dimMetrics)}
          metrics={metrics}
          range={range}
          bucket={bucket}
          points={points}
          models={loadable(models, (data) => data)}
          now={now}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <CallsSection queries={queries} now={now} className="max-sm:order-2" />
          <KpiCards
            className={cn("transition-opacity max-sm:order-1", dimMetrics)}
            metrics={metrics}
            points={sparklinePoints(points)}
            comparisonLabel={`vs ${previousPeriodLabel(range)}`}
          />
        </div>
      </div>
      <div className={ROW_TWO}>
        <LatestTracesSection queries={queries} now={now} />
        <RecentErrorsSection queries={queries} now={now} />
      </div>
      <ModelsSection queries={queries} />
    </div>
  );
}

interface SectionProps {
  queries: OverviewQueries;
  now: Date;
  className?: string;
}

function CallsSection({ queries, now, className }: SectionProps) {
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

function LatestTracesSection({ queries, now }: SectionProps) {
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

function RecentErrorsSection({ queries, now }: SectionProps) {
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

function ModelsSection({ queries }: { queries: OverviewQueries }) {
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

/** Placeholders in the shape of the dashboard, so nothing jumps when data arrives. */
function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className={ROW_ONE}>
        <SpendCardSkeleton />
        <div className="flex min-w-0 flex-col gap-4">
          <CallsErrorsChartSkeleton className="max-sm:order-2" />
          <KpiCardsSkeleton className="max-sm:order-1" />
        </div>
      </div>
      <div className={ROW_TWO}>
        <LatestTracesSkeleton />
        <RecentErrorsSkeleton />
      </div>
      <ModelTableSkeleton />
    </div>
  );
}
