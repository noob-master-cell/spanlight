import { useId, type ReactNode } from "react";

import { UnknownValue, ValueOrUnknown } from "@/components/unknown-value";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { TraceSummary } from "@/lib/api";
import { formatCost, formatDuration, formatInteger, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CostValue } from "@/features/traces/cost-value";
import { formatDayTime, pluralize } from "./session-format";
import {
  averageCostPerTurn,
  consistentUserId,
  modelUsage,
  sumTokens,
  timelinePoints,
  type SessionTotals,
} from "./session-summary";

/** Dot colours for the models list, in order of use. Rose is kept for errors. */
const MODEL_DOT_CLASSES = ["bg-chart-1", "bg-chart-3", "bg-chart-4", "bg-fuchsia"];

interface SessionSummaryCardProps {
  /** Loaded turns, oldest first. */
  traces: TraceSummary[];
  totals: SessionTotals;
  /** Older turns aren't loaded, so the totals cover the loaded turns only. */
  partial: boolean;
  className?: string;
}

/** The sticky Summary card. Every figure is computed from the loaded traces. */
export function SessionSummaryCard({
  traces,
  totals,
  partial,
  className,
}: SessionSummaryCardProps) {
  const titleId = useId();
  const tokens = sumTokens(traces);
  const models = modelUsage(traces);
  const userId = consistentUserId(traces);
  const lastTurn = traces.at(-1);

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      className={cn("flex flex-col gap-5 p-6", className)}
    >
      <div className="flex flex-col gap-0.5">
        <CardTitle id={titleId}>Summary</CardTitle>
        <CardDescription className="mt-0 font-medium">
          {partial
            ? `Totals across the ${pluralize(totals.turns, "loaded turn")}`
            : `Totals across all ${pluralize(totals.turns, "turn")}`}
        </CardDescription>
      </div>

      <TotalCost totals={totals} />

      <dl className="grid grid-cols-2 gap-2">
        <StatTile label="Turns">
          {formatInteger(totals.turns)}
          {partial ? "+" : ""}
        </StatTile>
        <StatTile label="Errors">
          <span className={totals.errors > 0 ? "text-danger-text" : undefined}>
            {formatInteger(totals.errors)}
          </span>
        </StatTile>
        <StatTile label="Tokens">{formatInteger(tokens.total)}</StatTile>
        <StatTile label="Time span">
          <ValueOrUnknown value={formatDuration(totals.durationMs)} reason="No timing data" />
        </StatTile>
      </dl>

      <hr className="border-border" />

      <SummarySection title="Models used">
        {models.length === 0 ? (
          <p className="text-xs font-medium text-muted-foreground">No model calls recorded.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {models.map((usage, index) => (
              <li key={usage.model} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    MODEL_DOT_CLASSES[index % MODEL_DOT_CLASSES.length],
                  )}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-label text-foreground">
                  {usage.model}
                </span>
                <span className="shrink-0 text-xs font-medium text-muted-foreground tabular">
                  {pluralize(usage.turns, "turn")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SummarySection>

      <SummarySection title="Tokens">
        <TokenBar input={tokens.input} output={tokens.output} />
      </SummarySection>

      <hr className="border-border" />

      <SummarySection title="Timeline">
        <TurnStrip traces={traces} totals={totals} />
        <dl className="flex flex-col gap-3">
          <TimelineRow label="Started" iso={totals.firstAt} />
          <TimelineRow label="Last turn" iso={lastTurn?.started_at ?? null} />
          {userId !== null ? (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-xs font-medium text-muted-foreground">User</dt>
              <dd className="min-w-0 truncate font-mono text-label text-foreground">{userId}</dd>
            </div>
          ) : null}
        </dl>
      </SummarySection>
    </Card>
  );
}

function TotalCost({ totals }: { totals: SessionTotals }) {
  const average = averageCostPerTurn(totals);
  let note = "No price for the models used";
  if (average !== null) {
    note = `About ${formatCost(average) ?? ""} per turn`;
  } else if (totals.costIsLowerBound) {
    note = "A lower bound: some turns have no price";
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-overline text-subtle-foreground uppercase">Total cost</p>
      <p className="text-metric text-foreground">
        {totals.costUsd === null ? (
          <UnknownValue reason="No price for the models used" />
        ) : (
          <CostValue cost={totals.costUsd} hasUnpriced={totals.costIsLowerBound} />
        )}
      </p>
      <p className="text-xs font-medium text-muted-foreground">{note}</p>
    </div>
  );
}

function StatTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-tile bg-surface-muted p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-semibold text-foreground tabular">{children}</dd>
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2.5">
      <h3 id={headingId} className="text-overline text-subtle-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function TokenBar({ input, output }: { input: number; output: number }) {
  const total = input + output;
  if (total === 0) {
    return <p className="text-xs font-medium text-muted-foreground">No token usage recorded.</p>;
  }

  return (
    <>
      <div aria-hidden className="flex h-2 gap-[3px]">
        {input > 0 ? (
          <span className="rounded-xs bg-chart-1" style={{ width: `${(input / total) * 100}%` }} />
        ) : null}
        {output > 0 ? (
          <span className="rounded-xs bg-chart-3" style={{ width: `${(output / total) * 100}%` }} />
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs font-medium text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-chart-1" />
          <span className="tabular">{formatInteger(input)} input</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-chart-3" />
          <span className="tabular">{formatInteger(output)} output</span>
        </li>
      </ul>
    </>
  );
}

/** Each turn as a dot along the session's time span; failed turns are larger rose dots. */
function TurnStrip({ traces, totals }: { traces: TraceSummary[]; totals: SessionTotals }) {
  const points = timelinePoints(traces);
  const failedCount = points.filter((point) => point.failed).length;
  // Draw failures last so they sit on top of nearby successful turns.
  const ordered = [...points].sort((a, b) => Number(a.failed) - Number(b.failed));
  const span = formatDuration(totals.durationMs);
  const description = [
    `${pluralize(points.length, "turn")}${span ? ` over ${span}` : ""}`,
    failedCount > 0 ? pluralize(failedCount, "failed turn") : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div role="img" aria-label={description} className="relative h-4">
      <span className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border" />
      {ordered.map((point) => (
        <span
          key={point.traceId}
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
            point.failed
              ? "size-2 bg-chart-2 ring-2 ring-surface"
              : "size-1.5 bg-chart-1 ring-1 ring-surface",
          )}
          style={{ left: `calc(7px + ${point.offset} * (100% - 14px))` }}
        />
      ))}
    </div>
  );
}

function TimelineRow({ label, iso }: { label: string; iso: string | null }) {
  const value = iso === null ? null : formatDayTime(iso, new Date(), { seconds: true });
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="font-mono text-label text-foreground tabular">
        {iso === null || value === null ? (
          <UnknownValue reason="No timing data" />
        ) : (
          <time dateTime={iso} title={formatTimestamp(iso) ?? undefined}>
            {value}
          </time>
        )}
      </dd>
    </div>
  );
}
