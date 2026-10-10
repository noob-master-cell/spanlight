import type { ReactNode } from "react";
import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";

import { ChartDataTableView } from "@/components/chart-data-table";
import { AreaGradient, ChartTooltip } from "@/components/chart-parts";
import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Bucket } from "@/lib/api";
import {
  CHART_MARGIN,
  GRID_PROPS,
  LINE_CURSOR,
  LINE_SERIES_PROPS,
  SERIES_COLORS,
  X_AXIS_PROPS,
  Y_AXIS_PROPS,
} from "@/lib/chart-theme";
import { formatCompact, formatInteger, formatPercent } from "@/lib/format";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

import {
  bucketAdjective,
  bucketNoun,
  formatBucketLabel,
  formatBucketRange,
  formatBucketTick,
  hasCallData,
  summarizeCalls,
  type ChartPoint,
} from "./chart-data";

const GRADIENT_ID = "overview-calls-fill";
const PLOT_HEIGHT_CLASSES = "h-[150px] sm:h-[196px]";

interface CallsErrorsChartProps {
  points: ChartPoint[];
  bucket: Bucket;
  /** e.g. "last 24h", for the phone subtitle. */
  rangeLabel: string;
  isRefreshing: boolean;
  now: Date;
  className?: string;
}

/**
 * LLM calls per bucket as a violet area, failed calls as a rose line on their own right-hand
 * axis (errors are usually two orders of magnitude smaller). Phones get a simplified plot
 * without y axes and with the totals as pills under the title.
 */
export function CallsErrorsChart({
  points,
  bucket,
  rangeLabel,
  isRefreshing,
  now,
  className,
}: CallsErrorsChartProps) {
  const { calls, errors } = summarizeCalls(points);
  const byBucket = new Map(points.map((point) => [point.bucketStart, point]));
  const noun = bucketNoun(bucket);
  const showAxes = useMediaQuery("(min-width: 640px)");
  const callsLabel = `${formatCompact(calls) ?? "0"} ${calls === 1 ? "call" : "calls"}`;
  const errorsLabel = `${formatInteger(errors) ?? "0"} ${errors === 1 ? "error" : "errors"}`;

  return (
    <CallsErrorsCard
      className={className}
      description={
        <>
          <span className="sm:hidden">
            {bucketAdjective(bucket)} · {rangeLabel}
          </span>
          <span className="max-sm:hidden">{bucketAdjective(bucket)} · errors on right axis</span>
        </>
      }
      totals={
        <>
          <Badge variant="accent" className="tabular">
            {callsLabel}
          </Badge>
          <Badge variant="danger" className="tabular">
            {errorsLabel}
          </Badge>
        </>
      }
    >
      <div className={cn("transition-opacity", isRefreshing && "opacity-60")}>
        {hasCallData(points) ? (
          <>
            <div
              role="img"
              aria-label={`LLM calls and errors per ${noun}: ${callsLabel}, ${errorsLabel} in total`}
              className={PLOT_HEIGHT_CLASSES}
            >
              <ComposedChart
                responsive
                style={{ width: "100%", height: "100%" }}
                data={points}
                margin={showAxes ? CHART_MARGIN : { top: 8, right: 4, bottom: 0, left: 4 }}
                accessibilityLayer={false}
              >
                <defs>
                  <AreaGradient id={GRADIENT_ID} color={SERIES_COLORS.calls} />
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis
                  dataKey="bucketStart"
                  {...X_AXIS_PROPS}
                  minTickGap={showAxes ? 32 : 48}
                  tickFormatter={(value: string) => formatBucketTick(value, bucket)}
                />
                <YAxis
                  yAxisId="calls"
                  hide={!showAxes}
                  {...Y_AXIS_PROPS}
                  width={40}
                  allowDecimals={false}
                  tickFormatter={(value: number) => formatCompact(value) ?? ""}
                />
                <YAxis
                  yAxisId="errors"
                  orientation="right"
                  hide={!showAxes}
                  {...Y_AXIS_PROPS}
                  tick={{ fill: "var(--danger-text)", fontSize: 12 }}
                  width={32}
                  allowDecimals={false}
                  tickFormatter={(value: number) => formatCompact(value) ?? ""}
                />
                <Tooltip
                  cursor={LINE_CURSOR}
                  isAnimationActive={false}
                  content={({ active, label }) => {
                    const point = typeof label === "string" ? byBucket.get(label) : undefined;
                    if (!point) {
                      return null;
                    }
                    const rate = point.llmCalls > 0 ? point.errors / point.llmCalls : null;
                    const errorValue = formatInteger(point.errors) ?? "0";
                    return (
                      <ChartTooltip
                        active={active}
                        title={formatBucketRange(point.bucketStart, bucket, now)}
                        rows={[
                          {
                            label: "Calls",
                            value: formatInteger(point.llmCalls),
                            color: SERIES_COLORS.calls,
                          },
                          {
                            label: "Errors",
                            value:
                              rate === null
                                ? errorValue
                                : `${errorValue} · ${formatPercent(rate) ?? ""}`,
                            color: SERIES_COLORS.errors,
                          },
                        ]}
                      />
                    );
                  }}
                />
                <Area
                  yAxisId="calls"
                  dataKey="llmCalls"
                  name="LLM calls"
                  {...LINE_SERIES_PROPS}
                  stroke={SERIES_COLORS.calls}
                  fill={`url(#${GRADIENT_ID})`}
                  activeDot={{ ...LINE_SERIES_PROPS.activeDot, fill: SERIES_COLORS.calls }}
                />
                <Line
                  yAxisId="errors"
                  dataKey="errors"
                  name="Errors"
                  {...LINE_SERIES_PROPS}
                  stroke={SERIES_COLORS.errors}
                  activeDot={{ ...LINE_SERIES_PROPS.activeDot, fill: SERIES_COLORS.errors }}
                />
              </ComposedChart>
            </div>
            <ChartDataTableView
              table={{
                caption: `LLM calls and errors per ${noun}`,
                columns: [noun === "hour" ? "Hour" : "Day", "LLM calls", "Errors"],
                rows: points.map((point) => ({
                  key: point.bucketStart,
                  cells: [
                    formatBucketLabel(point.bucketStart, bucket),
                    formatInteger(point.llmCalls) ?? "0",
                    formatInteger(point.errors) ?? "0",
                  ],
                })),
              }}
            />
          </>
        ) : (
          <div
            className={cn(
              PLOT_HEIGHT_CLASSES,
              "flex items-center justify-center rounded-tile border border-dashed border-border text-sm text-muted-foreground",
            )}
          >
            No LLM calls in this period
          </div>
        )}
      </div>
    </CallsErrorsCard>
  );
}

interface CallsErrorsCardProps {
  description?: ReactNode;
  totals?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Card chrome: title and description, the total pills (right on desktop, below on phones). */
function CallsErrorsCard({ description, totals, className, children }: CallsErrorsCardProps) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-3.5 p-5 sm:gap-4 sm:p-6", className)}>
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitle>Calls &amp; errors</CardTitle>
          {description ? (
            <CardDescription className="mt-0 font-medium">{description}</CardDescription>
          ) : null}
        </div>
        {totals ? <div className="flex shrink-0 flex-wrap gap-2">{totals}</div> : null}
      </div>
      {children}
    </Card>
  );
}

export function CallsErrorsChartSkeleton({ className }: { className?: string }) {
  return (
    <CallsErrorsCard
      className={className}
      totals={
        <>
          <Skeleton className="h-[25px] w-20 rounded-full" />
          <Skeleton className="h-[25px] w-20 rounded-full" />
        </>
      }
    >
      <div aria-hidden className={cn(PLOT_HEIGHT_CLASSES, "flex flex-col justify-end gap-3")}>
        <Skeleton className="h-full w-full rounded-tile" />
      </div>
    </CallsErrorsCard>
  );
}

interface CallsErrorsChartErrorProps {
  error: unknown;
  onRetry: () => void;
  className?: string;
}

export function CallsErrorsChartError({ error, onRetry, className }: CallsErrorsChartErrorProps) {
  return (
    <CallsErrorsCard className={className}>
      <ErrorState compact error={error} onRetry={onRetry} title="Couldn't load this chart" />
    </CallsErrorsCard>
  );
}
