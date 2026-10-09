import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ListTree } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { StatusDot } from "@/components/status-dot";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectParams } from "@/features/shell/project-context";
import type { TraceSummary } from "@/lib/api";
import { formatCost, formatDuration, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  describeAge,
  formatAge,
  primaryModelLabel,
  tokenLabel,
  traceDisplayName,
} from "./trace-rows";

interface LatestTracesProps {
  traces: TraceSummary[];
  /** The window ends now and the list refreshes on its own. */
  isLive: boolean;
  isRefreshing: boolean;
  now: Date;
  className?: string;
}

/**
 * The newest traces as tiles (Figma "Trace tile row"). Wide cards get the column layout with
 * headers; narrow ones (phones, the stacked tablet layout) get the two-line compact tile.
 * Each tile is one link with a spoken summary, so the visual columns need no table semantics.
 */
export function LatestTraces({ traces, isLive, isRefreshing, now, className }: LatestTracesProps) {
  return (
    <LatestTracesCard className={className} isLive={isLive} showViewAll={traces.length > 0}>
      {traces.length === 0 ? (
        <EmptyState
          icon={ListTree}
          title="No traces in this period"
          description="Traces your app sends show up here as they arrive."
          className="py-8"
        />
      ) : (
        <div
          className={cn("flex flex-col gap-1.5 transition-opacity", isRefreshing && "opacity-60")}
        >
          <div
            aria-hidden
            className="hidden gap-3 px-[18px] pt-1 pb-0.5 text-overline text-subtle-foreground uppercase @2xl:flex"
          >
            <span className="min-w-0 flex-1">Trace</span>
            <span className="w-[168px] shrink-0">Model</span>
            <span className="w-16 shrink-0 text-right">Duration</span>
            <span className="w-[84px] shrink-0 text-right">Tokens</span>
            <span className="w-[72px] shrink-0 text-right">Cost</span>
            <span className="w-9 shrink-0 text-right">Age</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {traces.map((trace) => (
              <li key={trace.trace_id}>
                <TraceTile trace={trace} now={now} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </LatestTracesCard>
  );
}

function TraceTile({ trace, now }: { trace: TraceSummary; now: Date }) {
  const { orgId, projectId } = useProjectParams();
  const failed = trace.error_count > 0;
  const name = traceDisplayName(trace);
  const model = primaryModelLabel(trace.models);
  const duration = formatDuration(trace.duration_ms) ?? "—";
  const tokens = tokenLabel(trace);
  const cost = formatCost(trace.cost_usd);
  const age = formatAge(trace.started_at, now) ?? "";

  const summary = [
    name,
    failed ? "failed" : "succeeded",
    model,
    duration,
    tokens ? tokens.replace(" tok", " tokens") : "no tokens",
    cost ?? "cost unknown",
    describeAge(trace.started_at, now),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      to="/$orgId/$projectId/traces/$traceId"
      params={{ orgId, projectId, traceId: trace.trace_id }}
      aria-label={summary}
      title={formatTimestamp(trace.started_at) ?? undefined}
      className={cn(
        "block rounded-tile transition-colors duration-200 focus-visible:outline-offset-0",
        failed
          ? "bg-danger-subtle hover:bg-danger-subtle/70"
          : "bg-surface-muted hover:bg-surface-hover",
      )}
    >
      {/* Wide: one 52px row aligned to the column headers. */}
      <span className="hidden h-[52px] items-center gap-3 px-[18px] @2xl:flex">
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <StatusDot state={failed ? "error" : "ok"} />
          <span className="truncate text-sm font-semibold text-foreground">{name}</span>
        </span>
        <span className="w-[168px] shrink-0 truncate font-mono text-label text-muted-foreground">
          {model ?? "—"}
        </span>
        <span className="w-16 shrink-0 text-right text-sm font-medium text-foreground tabular">
          {duration}
        </span>
        <span className="w-[84px] shrink-0 text-right text-sm text-muted-foreground tabular">
          {tokens ?? "—"}
        </span>
        <span
          className={cn(
            "w-[72px] shrink-0 text-right text-sm font-semibold tabular",
            cost ? "text-foreground" : "text-subtle-foreground",
          )}
        >
          {cost ?? "—"}
        </span>
        <span className="w-9 shrink-0 text-right text-xs font-medium text-subtle-foreground tabular">
          {age}
        </span>
      </span>

      {/* Compact: name and cost, then model and the small stats. */}
      <span className="flex flex-col gap-1 px-4 py-3.5 @2xl:hidden">
        <span className="flex items-center gap-2.5">
          <StatusDot state={failed ? "error" : "ok"} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {name}
          </span>
          <span
            className={cn(
              "shrink-0 text-sm font-semibold tabular",
              cost ? "text-foreground" : "text-subtle-foreground",
            )}
          >
            {cost ?? "—"}
          </span>
        </span>
        <span className="flex items-center gap-2.5 pl-[18px] text-xs font-medium whitespace-nowrap text-subtle-foreground tabular">
          <span className="min-w-0 flex-1 truncate font-mono text-label font-normal text-muted-foreground">
            {model ?? "—"}
          </span>
          <span>{duration}</span>
          <span>{tokens ?? "—"}</span>
          <span>{age}</span>
        </span>
      </span>
    </Link>
  );
}

interface LatestTracesCardProps {
  isLive?: boolean;
  showViewAll?: boolean;
  className?: string;
  children: ReactNode;
}

function LatestTracesCard({
  isLive = false,
  showViewAll = false,
  className,
  children,
}: LatestTracesCardProps) {
  const { orgId, projectId } = useProjectParams();
  return (
    <Card className={cn("@container flex min-w-0 flex-col gap-1.5 p-3 sm:p-2", className)}>
      <div className="flex items-center justify-between gap-3 px-2 pt-1.5 pb-1.5 sm:px-[18px] sm:pt-3.5">
        <div className="flex items-center gap-2.5">
          <CardTitle>Latest traces</CardTitle>
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted py-[3px] pr-2.5 pl-2 text-xs font-medium text-muted-foreground max-sm:hidden">
              <StatusDot state="ok" pulse />
              Live
              <span className="sr-only">: refreshes automatically</span>
            </span>
          ) : null}
        </div>
        {showViewAll ? <ViewAllLink orgId={orgId} projectId={projectId} /> : null}
      </div>
      {children}
    </Card>
  );
}

function ViewAllLink({ orgId, projectId }: { orgId: string; projectId: string }) {
  return (
    <Link
      to="/$orgId/$projectId/traces"
      params={{ orgId, projectId }}
      className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-semibold text-accent hover:underline hover:underline-offset-4"
    >
      View all
      <span className="sr-only"> traces</span>
      <ArrowUpRight aria-hidden className="size-3.5" />
    </Link>
  );
}

export function LatestTracesSkeleton({ className }: { className?: string }) {
  return (
    <LatestTracesCard className={className}>
      <div aria-hidden className="flex flex-col gap-1.5 pt-6">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-[73px] rounded-tile @2xl:h-[52px]" />
        ))}
      </div>
    </LatestTracesCard>
  );
}

interface LatestTracesErrorProps {
  error: unknown;
  onRetry: () => void;
  className?: string;
}

export function LatestTracesError({ error, onRetry, className }: LatestTracesErrorProps) {
  return (
    <LatestTracesCard className={className}>
      <ErrorState compact error={error} onRetry={onRetry} title="Couldn't load the latest traces" />
    </LatestTracesCard>
  );
}
