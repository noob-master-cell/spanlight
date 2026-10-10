import type { AlertPreview, AlertRuleKind, Comparator, Metric } from "@/lib/api";

import { formatMetricValue, isUpward, METRIC_LABELS } from "./metric-labels";

/*
 * The rule preview as chart rows: one point per window end with the metric and the line it is
 * compared against. A value the server could not measure stays null, so the chart draws a gap
 * there instead of a dip to zero. Values are parsed to numbers only to be plotted; every label
 * is formatted from the original decimal string.
 */

export interface PreviewChartPoint {
  /** Epoch ms of the window end: the x position. */
  time: number;
  windowEnd: string;
  value: number | null;
  /** The decimal string behind `value`, for labels. */
  valueText: string | null;
  threshold: number | null;
  thresholdText: string | null;
}

export interface PreviewSeries {
  points: PreviewChartPoint[];
  /** Some value is a percentile estimated from hourly histograms: show the "≈" caption. */
  approximate: boolean;
  /** At least one point has a value; otherwise the panel shows the empty state. */
  hasData: boolean;
}

function toNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toPreviewSeries(preview: AlertPreview): PreviewSeries {
  const points: PreviewChartPoint[] = [];
  for (const point of preview.points) {
    const time = new Date(point.window_end).getTime();
    if (Number.isNaN(time)) {
      continue;
    }
    const value = toNumber(point.value);
    const threshold = toNumber(point.threshold);
    points.push({
      time,
      windowEnd: point.window_end,
      value,
      valueText: value === null ? null : point.value,
      threshold,
      thresholdText: threshold === null ? null : point.threshold,
    });
  }
  return {
    points,
    approximate: preview.approximate,
    hasData: points.some((point) => point.value !== null),
  };
}

/** Local midnights inside the series, for the x axis ("Oct 4" … "Oct 10"). */
export function dayTicks(points: readonly PreviewChartPoint[]): number[] {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) {
    return [];
  }
  const ticks: number[] = [];
  const day = new Date(first.time);
  day.setHours(24, 0, 0, 0);
  while (day.getTime() <= last.time) {
    ticks.push(day.getTime());
    day.setDate(day.getDate() + 1);
  }
  return ticks;
}

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const pointFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatDayTick(time: number): string {
  return dayFormat.format(time);
}

/** "Oct 9, 14:00": the window end in the tooltip. */
export function formatPointTime(time: number): string {
  return pointFormat.format(time);
}

/** What the dashed line is called: the threshold, or an anomaly rule's computed limit. */
export function lineName(kind: AlertRuleKind, comparator: Comparator): string {
  if (kind === "threshold") {
    return "Threshold";
  }
  return isUpward(comparator) ? "Upper limit" : "Lower limit";
}

function breaches(point: PreviewChartPoint, comparator: Comparator): boolean {
  if (point.value === null || point.threshold === null) {
    return false;
  }
  switch (comparator) {
    case "gt":
      return point.value > point.threshold;
    case "gte":
      return point.value >= point.threshold;
    case "lt":
      return point.value < point.threshold;
    case "lte":
      return point.value <= point.threshold;
  }
}

interface SummaryRule {
  metric: Metric;
  kind: AlertRuleKind;
  comparator: Comparator;
}

/** The chart in words, for screen readers: range, crossings and gaps. */
export function previewSummary(series: PreviewSeries, rule: SummaryRule): string {
  const known = series.points.filter((point) => point.value !== null);
  const label = METRIC_LABELS[rule.metric].label;
  if (known.length === 0) {
    return `${label} over the last 7 days: no data.`;
  }
  const byValue = [...known].sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
  const lowest = byValue[0];
  const highest = byValue.at(-1);
  const format = (text: string | null | undefined) =>
    formatMetricValue(rule.metric, text ?? null) ?? "unknown";
  const crossings = known.filter((point) => breaches(point, rule.comparator)).length;
  const gaps = series.points.length - known.length;
  const line = lineName(rule.kind, rule.comparator).toLowerCase();
  const parts = [
    `${label} over the last 7 days, ${series.points.length} points`,
    `lowest ${format(lowest?.valueText)}, highest ${format(highest?.valueText)}`,
    `${crossings} ${crossings === 1 ? "point crosses" : "points cross"} the ${line}`,
  ];
  if (gaps > 0) {
    parts.push(`${gaps} ${gaps === 1 ? "point has" : "points have"} no data`);
  }
  return `${parts.join("; ")}.`;
}
