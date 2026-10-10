import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTooltip, type ChartTooltipRow } from "@/components/chart-parts";
import type { AlertRuleKind, Comparator, Metric } from "@/lib/api";
import {
  CHART_MARGIN,
  GRID_PROPS,
  LINE_CURSOR,
  LINE_SERIES_PROPS,
  SERIES_COLORS,
  X_AXIS_PROPS,
  Y_AXIS_PROPS,
} from "@/lib/chart-theme";

import { formatMetricValue, METRIC_LABELS } from "./metric-labels";
import {
  dayTicks,
  formatDayTick,
  formatPointTime,
  lineName,
  previewSummary,
  type PreviewChartPoint,
  type PreviewSeries,
} from "./preview-series";

const VALUE_COLOR = SERIES_COLORS.calls;
const LINE_COLOR = "var(--danger)";
const TAG_HEIGHT = 20;

interface MetricPreviewChartProps {
  series: PreviewSeries;
  metric: Metric;
  kind: AlertRuleKind;
  comparator: Comparator;
}

/**
 * Figma "Preview chart": the metric over the last 7 days as a thin violet line with gaps where
 * nothing was measured, and the line it is compared against dashed in the danger colour, tagged
 * at its right end ("4 s", or "Upper limit" for an anomaly rule). The plot is an image with the
 * whole series described in words for screen readers.
 */
export function MetricPreviewChart({ series, metric, kind, comparator }: MetricPreviewChartProps) {
  const rule = { metric, kind, comparator };
  const name = lineName(kind, comparator);
  const byTime = new Map(series.points.map((point) => [point.time, point]));
  const lastLineIndex = series.points.findLastIndex((point) => point.threshold !== null);
  const lastLine = series.points[lastLineIndex];
  const tagText =
    kind === "threshold" ? (formatMetricValue(metric, lastLine?.thresholdText) ?? name) : name;
  const format = (value: number) => formatMetricValue(metric, String(value)) ?? "";

  return (
    <div role="img" aria-label={previewSummary(series, rule)} className="h-[176px] w-full">
      <LineChart
        responsive
        style={{ width: "100%", height: "100%" }}
        data={series.points}
        margin={{ ...CHART_MARGIN, top: TAG_HEIGHT + 4, right: 12 }}
        accessibilityLayer={false}
      >
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          ticks={dayTicks(series.points)}
          tickFormatter={formatDayTick}
          {...X_AXIS_PROPS}
        />
        <YAxis {...Y_AXIS_PROPS} width={52} tickCount={4} tickFormatter={format} />
        <Tooltip
          cursor={LINE_CURSOR}
          isAnimationActive={false}
          content={({ active, label }) => {
            const point = typeof label === "number" ? byTime.get(label) : undefined;
            return point ? (
              <ChartTooltip
                active={active}
                title={formatPointTime(point.time)}
                rows={tooltipRows(point, metric, name)}
              />
            ) : null;
          }}
        />
        <Line
          dataKey="threshold"
          name={name}
          {...LINE_SERIES_PROPS}
          type={kind === "threshold" ? "linear" : "monotone"}
          stroke={LINE_COLOR}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          activeDot={false}
          label={(props: TagProps) => (
            <LineTag {...props} show={props.index === lastLineIndex} text={tagText} />
          )}
        />
        <Line
          dataKey="value"
          name={METRIC_LABELS[metric].label}
          {...LINE_SERIES_PROPS}
          strokeWidth={2}
          stroke={VALUE_COLOR}
          activeDot={{ ...LINE_SERIES_PROPS.activeDot, fill: VALUE_COLOR }}
        />
      </LineChart>
    </div>
  );
}

/** The window's value and the line it was compared against; an unknown one reads "—". */
function tooltipRows(point: PreviewChartPoint, metric: Metric, name: string): ChartTooltipRow[] {
  return [
    {
      label: METRIC_LABELS[metric].label,
      value: formatMetricValue(metric, point.valueText),
      color: VALUE_COLOR,
    },
    { label: name, value: formatMetricValue(metric, point.thresholdText), color: LINE_COLOR },
  ];
}

interface TagProps {
  x?: number | string;
  y?: number | string;
  index?: number;
}

/** Figma "Threshold tag": a danger-tinted pill sitting on the line's last point. */
function LineTag({ x, y, show, text }: TagProps & { show: boolean; text: string }) {
  if (!show || typeof x !== "number" || typeof y !== "number") {
    return <g />;
  }
  const width = text.length * 6.6 + 16;
  return (
    <g aria-hidden>
      <rect
        x={x - width}
        y={y - TAG_HEIGHT - 4}
        width={width}
        height={TAG_HEIGHT}
        rx={TAG_HEIGHT / 2}
        fill="var(--danger-subtle)"
      />
      <text
        x={x - width / 2}
        y={y - TAG_HEIGHT / 2 - 4}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--danger-text)"
        fontSize={12}
        fontWeight={600}
      >
        {text}
      </text>
    </g>
  );
}
