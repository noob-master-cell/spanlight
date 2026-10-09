import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CircleCheck, CircleX } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectParams } from "@/features/shell/project-context";
import type { TraceSummary } from "@/lib/api";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  describeAge,
  failedSpansLabel,
  formatAge,
  primaryModelLabel,
  traceDisplayName,
} from "./trace-rows";

interface RecentErrorsProps {
  traces: TraceSummary[];
  /** True when more failed traces exist than the ones listed. */
  hasMore: boolean;
  isRefreshing: boolean;
  now: Date;
  className?: string;
}

/** The latest failed traces with the first error message, newest first. */
export function RecentErrors({ traces, hasMore, isRefreshing, now, className }: RecentErrorsProps) {
  const count = traces.length;
  return (
    <RecentErrorsCard
      className={className}
      showViewAll={count > 0}
      count={count > 0 ? <ErrorCount count={count} hasMore={hasMore} /> : null}
    >
      {count === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="No errors in this period"
          description="Traces with a failed span show up here."
          className="py-8"
        />
      ) : (
        <ul className={cn("flex flex-col transition-opacity", isRefreshing && "opacity-60")}>
          {traces.map((trace) => (
            <li key={trace.trace_id} className="border-b border-border last:border-b-0">
              <ErrorRow trace={trace} now={now} />
            </li>
          ))}
        </ul>
      )}
    </RecentErrorsCard>
  );
}

function ErrorCount({ count, hasMore }: { count: number; hasMore: boolean }) {
  const label = hasMore ? `${count}+` : String(count);
  return (
    <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-xs font-medium text-danger-text tabular">
      <span aria-hidden>{label}</span>
      <span className="sr-only">
        {hasMore ? `latest ${count} shown, more in Traces` : `${count} shown`}
      </span>
    </span>
  );
}

function ErrorRow({ trace, now }: { trace: TraceSummary; now: Date }) {
  const { orgId, projectId } = useProjectParams();
  const model = primaryModelLabel(trace.models);
  const failedSpans = failedSpansLabel(trace.error_count);
  const meta = [model, failedSpans].filter(Boolean).join(" · ");
  const age = formatAge(trace.started_at, now);

  return (
    <Link
      to="/$orgId/$projectId/traces/$traceId"
      params={{ orgId, projectId, traceId: trace.trace_id }}
      className="group -mx-2 flex items-start gap-3 rounded-tile px-2 py-3.5 transition-colors duration-200 hover:bg-surface-hover focus-visible:outline-offset-0"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[11px] bg-danger-subtle">
        <CircleX aria-hidden className="size-4 text-danger" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-semibold text-foreground">
            <span className="sr-only">Failed trace: </span>
            {traceDisplayName(trace)}
          </span>
          {age ? (
            <time
              dateTime={trace.started_at}
              title={formatTimestamp(trace.started_at) ?? undefined}
              className="shrink-0 text-xs font-medium text-subtle-foreground tabular"
            >
              <span aria-hidden>{age} ago</span>
              <span className="sr-only">{describeAge(trace.started_at, now)}</span>
            </time>
          ) : null}
        </span>
        {trace.error_message ? (
          <span
            title={trace.error_message}
            className="truncate font-mono text-label text-danger-text"
          >
            {trace.error_message}
          </span>
        ) : (
          <span className="truncate text-label text-muted-foreground italic">
            No error message recorded
          </span>
        )}
        {meta ? (
          <span className="truncate text-xs font-medium text-muted-foreground">{meta}</span>
        ) : null}
      </span>
    </Link>
  );
}

interface RecentErrorsCardProps {
  count?: ReactNode;
  showViewAll?: boolean;
  className?: string;
  children: ReactNode;
}

function RecentErrorsCard({
  count,
  showViewAll = false,
  className,
  children,
}: RecentErrorsCardProps) {
  const { orgId, projectId } = useProjectParams();
  return (
    <Card className={cn("flex min-w-0 flex-col gap-1 p-5 sm:p-6", className)}>
      <div className="flex items-center justify-between gap-3 pb-1.5">
        <div className="flex items-center gap-2">
          <CardTitle>Recent errors</CardTitle>
          {count}
        </div>
        {showViewAll ? (
          <Link
            to="/$orgId/$projectId/traces"
            params={{ orgId, projectId }}
            search={{ status: "error" }}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-semibold text-accent hover:underline hover:underline-offset-4"
          >
            View all
            <span className="sr-only"> failed traces</span>
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

export function RecentErrorsSkeleton({ className }: { className?: string }) {
  return (
    <RecentErrorsCard className={className}>
      <div aria-hidden className="flex flex-col">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex items-start gap-3 border-b border-border py-3.5 last:border-b-0"
          >
            <Skeleton className="size-8 rounded-[11px]" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </RecentErrorsCard>
  );
}

interface RecentErrorsErrorProps {
  error: unknown;
  onRetry: () => void;
  className?: string;
}

export function RecentErrorsError({ error, onRetry, className }: RecentErrorsErrorProps) {
  return (
    <RecentErrorsCard className={className}>
      <ErrorState compact error={error} onRetry={onRetry} title="Couldn't load recent errors" />
    </RecentErrorsCard>
  );
}
