import { Link, useNavigate } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";

import { CostValue } from "@/components/cost-value";
import { RelativeTime } from "@/components/relative-time";
import { ValueOrUnknown } from "@/components/unknown-value";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectParams } from "@/features/shell/project-context";
import type { TraceSummary } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

import { TraceStatusDot } from "./status";
import {
  EnvironmentBadge,
  ModelBadges,
  TagBadges,
  TokenPair,
  TraceErrorLine,
  UserSession,
} from "./trace-cells";

/*
 * Figma "Traces/Table row": a 56px rounded row inside an 8px-padded card. Columns appear as the
 * card (a size container) gets wider, so the table never scrolls sideways:
 *   base      status · name · started · duration · models · cost
 *   @3xl      + tokens
 *   @4xl      + user / session
 *   65rem     + environment · tags (the full Figma layout at 1440px)
 * Hidden cells don't take a grid slot, so each template lists only the visible columns.
 */
const ROW_GRID = cn(
  "grid items-center gap-2.5 px-3",
  "grid-cols-[16px_minmax(0,1fr)_104px_64px_156px_88px]",
  "@3xl:grid-cols-[16px_minmax(0,1fr)_104px_64px_156px_88px_88px]",
  "@4xl:grid-cols-[16px_minmax(0,1fr)_104px_64px_156px_88px_88px_110px]",
  "@min-[65rem]:grid-cols-[16px_minmax(0,1fr)_104px_64px_156px_88px_88px_88px_92px_110px]",
);

const SHOW_TOKENS = "hidden @3xl:block";
const SHOW_USER = "hidden @4xl:block";
const SHOW_ENV_AND_TAGS = "hidden @min-[65rem]:block";

interface TracesTableProps {
  traces: TraceSummary[];
  /** The trace opened last; its row is highlighted when you come back to the list. */
  selectedTraceId?: string | null;
  /** Dim rows while results for new filters are loading. */
  stale?: boolean;
}

export function TracesTable({ traces, selectedTraceId = null, stale = false }: TracesTableProps) {
  const navigate = useNavigate();
  const { orgId, projectId } = useProjectParams();

  function openTrace(event: MouseEvent<HTMLDivElement>, traceId: string) {
    // Let real links/buttons inside the row, and text selection, behave normally.
    const target = event.target as HTMLElement;
    const interactive = target.closest("a, button, input, [role='button'], [tabindex]");
    if (interactive && event.currentTarget.contains(interactive)) {
      return;
    }
    if (window.getSelection()?.toString()) {
      return;
    }
    void navigate({
      to: "/$orgId/$projectId/traces/$traceId",
      params: { orgId, projectId, traceId },
    });
  }

  return (
    <div
      role="table"
      aria-label="Traces"
      aria-busy={stale || undefined}
      className={cn("flex flex-col gap-0.5 transition-opacity", stale && "opacity-60")}
    >
      <TracesTableHead />
      <div role="rowgroup" className="flex flex-col gap-0.5">
        {traces.map((trace) => {
          const selected = trace.trace_id === selectedTraceId;
          return (
            <div
              key={trace.trace_id}
              role="row"
              data-state={selected ? "selected" : undefined}
              onClick={(event) => {
                openTrace(event, trace.trace_id);
              }}
              className={cn(
                ROW_GRID,
                "group/row h-14 cursor-pointer rounded-input text-sm transition-colors",
                selected ? "bg-surface-selected" : "hover:bg-surface-hover",
              )}
            >
              <Cell className="flex justify-center">
                <TraceStatusDot errorCount={trace.error_count} errorMessage={trace.error_message} />
              </Cell>
              <Cell className="min-w-0">
                <TraceName trace={trace} orgId={orgId} projectId={projectId} />
              </Cell>
              <Cell className="truncate text-muted-foreground">
                <RelativeTime iso={trace.started_at} />
              </Cell>
              <Cell className="text-right text-foreground tabular">
                <ValueOrUnknown
                  value={formatDuration(trace.duration_ms)}
                  reason="Duration isn't known yet"
                />
              </Cell>
              <Cell className="min-w-0">
                <ModelBadges models={trace.models} />
              </Cell>
              <Cell className={cn(SHOW_TOKENS, "text-right text-muted-foreground")}>
                <TokenPair input={trace.input_tokens} output={trace.output_tokens} />
              </Cell>
              <Cell className="text-right font-medium text-foreground">
                <CostValue cost={trace.cost_usd} hasUnpriced={trace.has_unpriced} />
              </Cell>
              <Cell className={cn(SHOW_ENV_AND_TAGS, "min-w-0")}>
                <EnvironmentBadge environment={trace.environment} />
              </Cell>
              <Cell className={cn(SHOW_ENV_AND_TAGS, "min-w-0")}>
                <TagBadges tags={trace.tags} />
              </Cell>
              <Cell className={cn(SHOW_USER, "min-w-0")}>
                <UserSession userId={trace.external_user_id} sessionId={trace.session_id} />
              </Cell>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div role="cell" className={className}>
      {children}
    </div>
  );
}

function HeaderCell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div role="columnheader" className={cn("truncate", className)}>
      {children}
    </div>
  );
}

function TracesTableHead() {
  return (
    <div role="rowgroup">
      <div
        role="row"
        className={cn(
          ROW_GRID,
          "h-9 rounded-input bg-surface-muted text-overline text-muted-foreground uppercase",
        )}
      >
        <HeaderCell>
          <span className="sr-only">Status</span>
        </HeaderCell>
        <HeaderCell>Name</HeaderCell>
        <HeaderCell>Started</HeaderCell>
        <HeaderCell className="text-right">Duration</HeaderCell>
        <HeaderCell>Models</HeaderCell>
        <HeaderCell className={cn(SHOW_TOKENS, "text-right")}>Tokens</HeaderCell>
        <HeaderCell className="text-right">Cost</HeaderCell>
        <HeaderCell className={SHOW_ENV_AND_TAGS}>Env</HeaderCell>
        <HeaderCell className={SHOW_ENV_AND_TAGS}>Tags</HeaderCell>
        <HeaderCell className={SHOW_USER}>User / session</HeaderCell>
      </div>
    </div>
  );
}

interface TraceNameProps {
  trace: TraceSummary;
  orgId: string;
  projectId: string;
}

/** Bold name (the row's link) over the trace ID in mono, or over the class and message of a failed trace. */
function TraceName({ trace, orgId, projectId }: TraceNameProps) {
  const hasName = trace.name !== null && trace.name !== "";
  return (
    <div className="flex min-w-0 flex-col">
      <Link
        to="/$orgId/$projectId/traces/$traceId"
        params={{ orgId, projectId, traceId: trace.trace_id }}
        className={cn(
          "truncate rounded-sm font-semibold text-foreground hover:underline",
          !hasName && "font-medium text-muted-foreground italic",
        )}
      >
        {hasName ? trace.name : "Unnamed trace"}
      </Link>
      {trace.error_class !== null || trace.error_message ? (
        <TraceErrorLine errorClass={trace.error_class} message={trace.error_message} />
      ) : (
        <span
          title={trace.trace_id}
          className="truncate font-mono text-label text-subtle-foreground group-hover/row:text-muted-foreground"
        >
          {trace.trace_id}
        </span>
      )}
    </div>
  );
}

export function TracesTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-0.5">
      <div className={cn(ROW_GRID, "h-9 rounded-input bg-surface-muted")} />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={cn(ROW_GRID, "h-14")}>
          <Skeleton className="mx-auto size-2 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-36 max-w-full" />
          </div>
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="ml-auto h-3.5 w-12" />
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className={cn(SHOW_TOKENS, "ml-auto h-3.5 w-16")} />
          <Skeleton className="ml-auto h-3.5 w-16" />
          <Skeleton className={cn(SHOW_ENV_AND_TAGS, "h-6 w-20 rounded-full")} />
          <Skeleton className={cn(SHOW_ENV_AND_TAGS, "h-6 w-12 rounded-full")} />
          <Skeleton className={cn(SHOW_USER, "h-3.5 w-24")} />
        </div>
      ))}
    </div>
  );
}
