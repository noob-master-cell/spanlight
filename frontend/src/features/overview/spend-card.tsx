import { CircleDollarSign, Info, RotateCw } from "lucide-react";
import { Bar, BarChart, Rectangle, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";

import { ChartDataTableView } from "@/components/chart-data-table";
import { ChartTooltip } from "@/components/chart-parts";
import { DeltaPill } from "@/components/delta-pill";
import { UnknownValue } from "@/components/unknown-value";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Bucket, ModelMetrics, OverviewMetrics } from "@/lib/api";
import { BAR_MAX_SIZE, HIGHLIGHT_BAR_COLOR, INK_AXIS_TICK, INK_BAR_COLOR } from "@/lib/chart-theme";
import { formatCost, formatInteger, parseMoney } from "@/lib/format";
import type { ResolvedRange } from "@/lib/time-range";
import { cn } from "@/lib/utils";

import {
  bucketNoun,
  formatBucketLabel,
  formatBucketRange,
  formatBucketTick,
  hasCostData,
  type ChartPoint,
} from "./chart-data";
import { shortRangeLabel } from "./hero";
import { percentDelta, previousPeriodLabel } from "./kpis";
import {
  daysInMonth,
  formatCompactCost,
  formatShare,
  formatTileCost,
  peakIndex,
  projectMonthlySpend,
  relativeBucketLabel,
  relativeTickIndexes,
  shortModelLabel,
  splitCurrency,
  topModelsByCost,
} from "./spend";

/** A query's state as the card needs it: data, still loading, or failed with a retry. */
export type Loadable<T> =
  { status: "success"; data: T } | { status: "pending" } | { status: "error"; retry: () => void };

interface SpendCardProps {
  metrics: OverviewMetrics;
  range: ResolvedRange;
  bucket: Bucket;
  points: Loadable<ChartPoint[]>;
  models: Loadable<ModelMetrics[]>;
  now: Date;
  className?: string;
}

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long" });

/**
 * The headline card (Figma "Spend card"): spend for the window with muted cents, the change
 * versus the previous window, a monthly projection for short windows, spend per bucket with
 * the peak in lime, and the three most expensive models.
 */
export function SpendCard({
  metrics,
  range,
  bucket,
  points,
  models,
  now,
  className,
}: SpendCardProps) {
  const { current, previous } = metrics;
  const cost = parseMoney(current.cost_usd);
  const previousCost = parseMoney(previous.cost_usd);
  const projection = projectMonthlySpend(cost, range.durationMs, now);
  const comparisonLabel = `vs ${previousPeriodLabel(range)}`;

  const projectionLabel =
    projection === null ? null : `Projected ${formatCompactCost(projection)} this month`;
  const comparison =
    previousCost === null
      ? null
      : `vs ${formatCost(previousCost) ?? ""} ${previousPeriodLabel(range)}`;

  return (
    <Card
      variant="hero"
      className={cn("flex flex-col gap-6 overflow-hidden p-6 sm:p-7", className)}
    >
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-rail-muted-foreground">
            <CircleDollarSign aria-hidden className="size-4 max-sm:hidden" />
            Spend · {shortRangeLabel(range)}
          </h2>
          <DeltaPill
            delta={percentDelta(cost, previousCost)}
            increaseIsGood={false}
            surface="ink"
            comparisonLabel={comparisonLabel}
          />
        </div>

        <p className="mt-5 text-metric-xl text-hero-card-foreground tabular">
          {cost === null ? (
            <UnknownValue
              reason="No price for any model in this period"
              className="text-rail-subtle-foreground decoration-rail-subtle-foreground"
            />
          ) : (
            <SplitAmount amount={cost} />
          )}
        </p>

        {projectionLabel || comparison ? (
          <p className="mt-2.5 text-sm text-rail-muted-foreground">
            {projectionLabel}
            {projectionLabel ? (
              <span className="sr-only">
                {` (estimate: this window's spend per day × ${daysInMonth(now)} days in ${monthFormat.format(now)})`}
              </span>
            ) : null}
            {projectionLabel && comparison ? (
              // Phones show only the projection (the delta pill already compares windows);
              // screen readers still get the previous amount.
              <span className="max-sm:sr-only"> · {comparison}</span>
            ) : (
              comparison
            )}
          </p>
        ) : null}

        {current.unpriced_calls > 0 && cost !== null ? (
          <p className="flex items-center gap-1.5 pt-2 text-xs font-medium text-rail-subtle-foreground">
            <Info aria-hidden className="size-[13px] shrink-0" />
            {formatInteger(current.unpriced_calls)}{" "}
            {current.unpriced_calls === 1 ? "call" : "calls"} unpriced · spend is a lower bound
          </p>
        ) : null}
      </div>

      <CostBars points={points} bucket={bucket} range={range} now={now} />
      <TopModelTiles models={models} />
    </Card>
  );
}

function SplitAmount({ amount }: { amount: number }) {
  const { whole, fraction } = splitCurrency(amount);
  return (
    <>
      {whole}
      <span className="text-rail-subtle-foreground">{fraction}</span>
    </>
  );
}

/* ---------- Spend per bucket ---------- */

interface CostBarsProps {
  points: Loadable<ChartPoint[]>;
  bucket: Bucket;
  range: ResolvedRange;
  now: Date;
}

const BAR_AREA_CLASSES = "relative min-h-[156px] flex-1";

/** The translucent bar colour would vanish on the ink tooltip; key ordinary bars in light grey. */
const TOOLTIP_BAR_KEY_COLOR = "var(--rail-muted-foreground)";

function CostBars({ points, bucket, range, now }: CostBarsProps) {
  if (points.status === "pending") {
    return <CostBarsSkeleton />;
  }
  if (points.status === "error") {
    return (
      <div
        role="alert"
        className={cn(
          BAR_AREA_CLASSES,
          "flex flex-col items-center justify-center gap-3 rounded-tile border border-dashed border-rail-tile-hover text-center",
        )}
      >
        <p className="text-sm text-rail-muted-foreground">Couldn&apos;t load spend over time.</p>
        <Button size="sm" onClick={points.retry}>
          <RotateCw aria-hidden />
          Try again
        </Button>
      </div>
    );
  }

  const data = points.data;
  const noun = bucketNoun(bucket);
  if (!hasCostData(data)) {
    return (
      <div
        className={cn(
          BAR_AREA_CLASSES,
          "flex items-center justify-center rounded-tile border border-dashed border-rail-tile-hover px-6 text-center text-sm text-rail-muted-foreground",
        )}
      >
        No priced LLM calls in this window
      </div>
    );
  }

  const peak = peakIndex(data.map((point) => point.costUsd));
  const peakPoint = peak === null ? undefined : data[peak];
  const indexByBucket = new Map(data.map((point, index) => [point.bucketStart, index]));
  const lastIndex = data.length - 1;
  // Preset windows end now, so ticks count back from the latest bucket ("−6h", "Now").
  const relative = range.value !== "custom";
  const tickValues = relativeTickIndexes(data.length).map((index) => data[index]?.bucketStart);

  function tickLabel(bucketStart: string): string {
    const index = indexByBucket.get(bucketStart) ?? 0;
    return relative
      ? relativeBucketLabel(lastIndex - index, bucket)
      : formatBucketTick(bucketStart, bucket);
  }

  const peakDescription = peakPoint
    ? `, peaking at ${formatCost(peakPoint.costUsd) ?? ""} (${formatBucketLabel(peakPoint.bucketStart, bucket)})`
    : "";

  return (
    <div className={BAR_AREA_CLASSES}>
      <div
        role="img"
        aria-label={`Spend per ${noun}${peakDescription}`}
        className="absolute inset-0"
      >
        <BarChart
          responsive
          style={{ width: "100%", height: "100%" }}
          data={data}
          margin={{ top: 24, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="18%"
          accessibilityLayer={false}
        >
          <XAxis
            dataKey="bucketStart"
            ticks={tickValues.filter((value): value is string => value !== undefined)}
            interval={0}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            height={30}
            tick={(props: TickProps) => (
              <EdgeAlignedTick
                {...props}
                label={tickLabel(props.payload.value)}
                first={props.payload.value === data[0]?.bucketStart}
                last={props.payload.value === data[lastIndex]?.bucketStart}
              />
            )}
          />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            cursor={{ fill: "var(--rail-tile)" }}
            isAnimationActive={false}
            content={({ active, label }) => {
              const index = typeof label === "string" ? indexByBucket.get(label) : undefined;
              const point = index === undefined ? undefined : data[index];
              if (!point) {
                return null;
              }
              return (
                <ChartTooltip
                  active={active}
                  title={formatBucketRange(point.bucketStart, bucket, now)}
                  rows={[
                    {
                      label: point.costUsd === null ? "Spend · no priced calls" : "Spend",
                      value: formatCost(point.costUsd),
                      color: index === peak ? HIGHLIGHT_BAR_COLOR : TOOLTIP_BAR_KEY_COLOR,
                    },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="costUsd"
            name="Spend"
            radius={[8, 8, 3, 3]}
            maxBarSize={BAR_MAX_SIZE}
            isAnimationActive={false}
            shape={(props: BarShapeProps) => (
              <PeakAwareBar {...props} isPeak={props.originalDataIndex === peak} />
            )}
          />
        </BarChart>
      </div>
      <ChartDataTableView
        table={{
          caption: `Spend per ${noun} in US dollars`,
          columns: [noun === "hour" ? "Hour" : "Day", "Spend"],
          rows: data.map((point) => ({
            key: point.bucketStart,
            cells: [
              formatBucketLabel(point.bucketStart, bucket),
              formatCost(point.costUsd) ?? "No priced calls",
            ],
          })),
        }}
      />
    </div>
  );
}

interface TickProps {
  x: number | string;
  y: number | string;
  payload: { value: string };
}

/** Axis label centred under its bar, except the outermost ones, which align to the card edge. */
function EdgeAlignedTick({
  x,
  y,
  label,
  first,
  last,
}: TickProps & { label: string; first: boolean; last: boolean }) {
  let anchor: "start" | "middle" | "end" = "middle";
  if (first) {
    anchor = "start";
  } else if (last) {
    anchor = "end";
  }
  return (
    <text
      x={Number(x)}
      y={Number(y)}
      dy={10}
      textAnchor={anchor}
      fill={INK_AXIS_TICK.fill}
      fontSize={INK_AXIS_TICK.fontSize}
      fontWeight={500}
    >
      {label}
    </text>
  );
}

/**
 * One spend bar. The peak is lime with its value above it (Figma "Peak value"). Recharts skips
 * buckets without a priced call, so the peak is matched on the data index, not the render index.
 */
function PeakAwareBar({ isPeak, ...props }: BarShapeProps & { isPeak: boolean }) {
  const value = typeof props.value === "number" ? props.value : null;
  return (
    <g>
      <Rectangle {...props} fill={isPeak ? HIGHLIGHT_BAR_COLOR : INK_BAR_COLOR} />
      {isPeak && value !== null ? (
        <text
          x={props.x + props.width / 2}
          y={props.y - 8}
          textAnchor="middle"
          fill={HIGHLIGHT_BAR_COLOR}
          fontSize={12}
          fontWeight={500}
        >
          {formatCost(value)}
        </text>
      ) : null}
    </g>
  );
}

const SKELETON_BARS = [32, 44, 36, 56, 50, 64, 52, 74, 92, 60, 48, 40];

function CostBarsSkeleton() {
  return (
    <div aria-hidden className={cn(BAR_AREA_CLASSES, "flex items-end gap-1.5 pb-7")}>
      {SKELETON_BARS.map((height, index) => (
        <div
          key={index}
          className="flex-1 rounded-t-lg rounded-b-[3px] bg-rail-tile"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

/** Loading placeholder in the shape of the spend card, drawn in ink tones. */
export function SpendCardSkeleton({ className }: { className?: string }) {
  return (
    <Card
      variant="hero"
      aria-hidden
      className={cn("flex min-h-[466px] flex-col gap-6 overflow-hidden p-6 sm:p-7", className)}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 rounded-md bg-rail-tile" />
          <div className="h-[25px] w-16 rounded-full bg-rail-tile" />
        </div>
        <div className="h-[60px] w-56 rounded-lg bg-rail-tile" />
        <div className="h-4 w-64 rounded-md bg-rail-tile" />
      </div>
      <CostBarsSkeleton />
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
        {MODEL_DOT_CLASSES.map((dot) => (
          <div key={dot} className="h-[73px] rounded-tile bg-rail-tile sm:h-[79px]" />
        ))}
      </div>
    </Card>
  );
}

/* ---------- Top models ---------- */

const MODEL_DOT_CLASSES = ["bg-lime", "bg-chart-1", "bg-chart-3"] as const;

function TopModelTiles({ models }: { models: Loadable<ModelMetrics[]> }) {
  if (models.status === "pending") {
    return (
      <div aria-hidden className="grid grid-cols-3 gap-2 sm:gap-2.5">
        {MODEL_DOT_CLASSES.map((dot) => (
          <div key={dot} className="h-[73px] rounded-tile bg-rail-tile sm:h-[79px]" />
        ))}
      </div>
    );
  }
  // A failed models request is reported (with a retry) by the Models card below.
  if (models.status === "error") {
    return null;
  }

  const top = topModelsByCost(models.data);
  if (top.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Top models by spend" className="grid grid-cols-3 gap-2 sm:gap-2.5">
      {top.map((entry, index) => (
        <li
          key={entry.key}
          title={entry.model}
          className="flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-tile bg-rail-tile px-2.5 py-3 sm:p-3.5"
        >
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-rail-muted-foreground">
            <span
              aria-hidden
              className={cn("size-1.5 shrink-0 rounded-full", MODEL_DOT_CLASSES[index])}
            />
            <span aria-hidden className="truncate">
              {shortModelLabel(entry.model)}
            </span>
            <span className="sr-only">{entry.model}</span>
          </span>
          <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-h2 text-hero-card-foreground tabular">
              {formatTileCost(entry.costUsd)}
            </span>
            <span className="text-xs font-medium text-rail-subtle-foreground tabular max-sm:sr-only">
              {formatShare(entry.share)}
              <span className="sr-only"> of spend</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
