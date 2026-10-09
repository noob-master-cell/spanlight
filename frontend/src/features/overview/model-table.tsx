import { Link } from "@tanstack/react-router";
import { Boxes, ChevronDown, Info } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { UnknownValue, ValueOrUnknown } from "@/components/unknown-value";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectParams } from "@/features/shell/project-context";
import type { ModelMetrics } from "@/lib/api";
import {
  formatCompact,
  formatCost,
  formatDuration,
  formatInteger,
  formatPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  formatProvider,
  isUnpriced,
  MODEL_PREVIEW_LIMIT,
  modelErrorRate,
  modelRowKey,
  sortModelsByCalls,
  unpricedCalls,
} from "./models";

const NO_CALLS = "No LLM calls in this period";
const NO_PRICE = "No price for this model";

interface ModelTableProps {
  models: ModelMetrics[];
  isRefreshing: boolean;
  className?: string;
}

/**
 * Per-model usage, latency and cost (Figma "Models card"). A real table when the card is wide;
 * on narrow cards each model becomes a tile with the three numbers that matter most.
 */
export function ModelTable({ models, isRefreshing, className }: ModelTableProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const sorted = sortModelsByCalls(models);
  const canExpand = sorted.length > MODEL_PREVIEW_LIMIT;
  const visible = expanded ? sorted : sorted.slice(0, MODEL_PREVIEW_LIMIT);

  return (
    <ModelTableCard
      className={className}
      description={
        <>
          <span className="@4xl:hidden">
            Sorted by calls
            {canExpand && !expanded ? ` · top ${visible.length} of ${sorted.length}` : ""}
          </span>
          <span className="hidden @4xl:inline">
            Latency, tokens and cost per model · sorted by calls
          </span>
        </>
      }
      action={
        canExpand ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => {
              setExpanded((current) => !current);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-semibold text-accent hover:underline hover:underline-offset-4"
          >
            {expanded ? "Top models" : "All models"}
            <ChevronDown
              aria-hidden
              className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
            />
          </button>
        ) : null
      }
    >
      {sorted.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No model calls in this period"
          description="Per-model latency, tokens and cost appear here once your app makes LLM calls."
          className="py-8"
        />
      ) : (
        <div id={listId} className={cn("transition-opacity", isRefreshing && "opacity-60")}>
          <ModelsTable models={visible} />
          <ModelTiles models={visible} />
          <p className="hidden border-t border-border px-5 pt-3.5 pb-3 text-xs font-medium text-muted-foreground @4xl:block">
            {visible.length < sorted.length
              ? `Showing top ${visible.length} of ${sorted.length} models`
              : `Showing all ${sorted.length} ${sorted.length === 1 ? "model" : "models"}`}
          </p>
        </div>
      )}
    </ModelTableCard>
  );
}

/* ---------- Wide: table ---------- */

const HEAD_CELL = "py-2.5 text-left text-overline font-semibold text-subtle-foreground uppercase";
const NUMERIC_HEAD = cn(HEAD_CELL, "text-right");

function ModelsTable({ models }: { models: ModelMetrics[] }) {
  return (
    <table className="hidden w-full border-separate border-spacing-0 @4xl:table">
      <caption className="sr-only">Models, busiest first</caption>
      <thead>
        <tr className="[&>th]:bg-surface-muted [&>th+th]:pl-3 [&>th:first-child]:rounded-l-tile [&>th:first-child]:pl-5 [&>th:last-child]:rounded-r-tile [&>th:last-child]:pr-5">
          <th scope="col" className={HEAD_CELL}>
            Model
          </th>
          <th scope="col" className={cn(HEAD_CELL, "hidden w-[116px] @5xl:table-cell")}>
            Provider
          </th>
          <th scope="col" className={cn(NUMERIC_HEAD, "w-[92px]")}>
            Calls
          </th>
          <th scope="col" className={cn(NUMERIC_HEAD, "w-[116px]")}>
            Errors
          </th>
          <th scope="col" className={cn(NUMERIC_HEAD, "w-[84px]")}>
            p50
          </th>
          <th scope="col" className={cn(NUMERIC_HEAD, "w-[84px]")}>
            p95
          </th>
          <th scope="col" className={cn(NUMERIC_HEAD, "w-[108px]")}>
            Tokens in
          </th>
          <th scope="col" className={cn(NUMERIC_HEAD, "w-[108px]")}>
            Tokens out
          </th>
          <th scope="col" className={cn(NUMERIC_HEAD, "w-[124px]")}>
            Cost
          </th>
        </tr>
      </thead>
      <tbody>
        {models.map((model) => (
          <ModelRow key={modelRowKey(model)} model={model} />
        ))}
      </tbody>
    </table>
  );
}

function ModelRow({ model }: { model: ModelMetrics }) {
  const errorRate = modelErrorRate(model);
  return (
    <tr className="h-14 [&:last-child>td]:border-b-0 [&>td]:border-b [&>td]:border-border [&>td+td]:pl-3 [&>td:first-child]:pl-5 [&>td:last-child]:pr-5">
      <td className="max-w-0 truncate">
        <ModelName model={model.model} />
      </td>
      <td className="hidden text-sm text-muted-foreground @5xl:table-cell">
        <ValueOrUnknown value={formatProvider(model.provider)} reason="Provider not reported" />
      </td>
      <td className="text-right text-sm font-medium text-foreground tabular">
        {formatInteger(model.calls)}
      </td>
      <td className="text-right whitespace-nowrap tabular">
        <span
          className={cn(
            "text-sm font-medium",
            model.errors > 0 ? "text-danger-text" : "text-muted-foreground",
          )}
        >
          {formatInteger(model.errors)}
        </span>
        {errorRate !== null && model.errors > 0 ? (
          <span className="ml-1.5 text-xs font-medium text-subtle-foreground">
            {formatPercent(errorRate)}
          </span>
        ) : null}
      </td>
      <td className="text-right text-sm text-muted-foreground tabular">
        <ValueOrUnknown value={formatDuration(model.p50_ms)} reason={NO_CALLS} />
      </td>
      <td className="text-right text-sm font-medium text-foreground tabular">
        <ValueOrUnknown value={formatDuration(model.p95_ms)} reason={NO_CALLS} />
      </td>
      <td className="text-right text-sm text-muted-foreground tabular">
        {formatCompact(model.input_tokens)}
      </td>
      <td className="text-right text-sm text-muted-foreground tabular">
        {formatCompact(model.output_tokens)}
      </td>
      <td className="text-right text-sm font-semibold text-foreground tabular">
        <ModelCost model={model} />
      </td>
    </tr>
  );
}

/* ---------- Narrow: tiles ---------- */

function ModelTiles({ models }: { models: ModelMetrics[] }) {
  const unpriced = unpricedCalls(models);
  return (
    <div className="mt-2 flex flex-col gap-2 @4xl:hidden">
      <ul className="grid gap-2 @xl:grid-cols-2 @3xl:grid-cols-3">
        {models.map((model) => (
          <li
            key={modelRowKey(model)}
            className="flex flex-col gap-3 rounded-tile bg-surface-muted p-4"
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                <ModelName model={model.model} />
              </span>
              <span className="shrink-0 text-sm font-semibold text-foreground tabular">
                <ModelCost model={model} />
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              <TileStat label="Calls">{formatInteger(model.calls)}</TileStat>
              <TileStat label="p95">
                <ValueOrUnknown value={formatDuration(model.p95_ms)} reason={NO_CALLS} />
              </TileStat>
              <TileStat label="Errors" danger={model.errors > 0}>
                {formatInteger(model.errors)}
              </TileStat>
            </dl>
          </li>
        ))}
      </ul>
      {unpriced > 0 ? (
        <p className="flex items-start gap-2 px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
          <Info aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>
            — means no price for this model. Its {formatInteger(unpriced)}{" "}
            {unpriced === 1 ? "call isn’t" : "calls aren’t"} in spend.
          </span>
        </p>
      ) : null}
    </div>
  );
}

function TileStat({
  label,
  danger = false,
  children,
}: {
  label: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-overline text-subtle-foreground uppercase">{label}</dt>
      <dd
        className={cn(
          "truncate text-sm font-medium tabular",
          danger ? "text-danger-text" : "text-foreground",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/* ---------- Shared cells ---------- */

function ModelCost({ model }: { model: ModelMetrics }) {
  if (isUnpriced(model)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-subtle-foreground">
        <Info aria-hidden className="size-3.5" />
        <UnknownValue reason={NO_PRICE} />
      </span>
    );
  }
  return <>{formatCost(model.cost_usd)}</>;
}

function ModelName({ model }: { model: string | null }) {
  const { orgId, projectId } = useProjectParams();
  if (model === null) {
    return <span className="text-sm text-muted-foreground italic">Unknown model</span>;
  }
  return (
    <Link
      to="/$orgId/$projectId/traces"
      params={{ orgId, projectId }}
      search={{ model }}
      title={`View traces using ${model}`}
      className="rounded-sm font-mono text-label text-foreground hover:text-accent hover:underline hover:underline-offset-4"
    >
      {model}
    </Link>
  );
}

interface ModelTableCardProps {
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

function ModelTableCard({ description, action, className, children }: ModelTableCardProps) {
  return (
    <Card className={cn("@container flex min-w-0 flex-col p-3 sm:p-2", className)}>
      <div className="flex items-center justify-between gap-3 px-2 py-1.5 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitle>Models</CardTitle>
          {description ? (
            <CardDescription className="mt-0 font-medium">{description}</CardDescription>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function ModelTableSkeleton({ className }: { className?: string }) {
  return (
    <ModelTableCard className={className}>
      <div aria-hidden className="mt-2 flex flex-col gap-2 @4xl:mt-0 @4xl:gap-0">
        <Skeleton className="hidden h-[34px] rounded-tile @4xl:block" />
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex h-[102px] items-center gap-4 rounded-tile bg-surface-muted px-5 @4xl:h-14 @4xl:rounded-none @4xl:border-b @4xl:border-border @4xl:bg-transparent"
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-4 w-14" />
            <Skeleton className="hidden h-4 w-14 @4xl:block" />
            <Skeleton className="hidden h-4 w-16 @4xl:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </ModelTableCard>
  );
}

interface ModelTableErrorProps {
  error: unknown;
  onRetry: () => void;
  className?: string;
}

export function ModelTableError({ error, onRetry, className }: ModelTableErrorProps) {
  return (
    <ModelTableCard className={className}>
      <ErrorState compact error={error} onRetry={onRetry} title="Couldn't load model metrics" />
    </ModelTableCard>
  );
}
