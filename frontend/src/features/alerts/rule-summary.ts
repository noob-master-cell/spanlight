import type { AlertRule } from "@/lib/api";

import {
  COMPARATOR_SYMBOLS,
  COMPARATOR_WORDS,
  formatMetricValue,
  isUpward,
  METRIC_LABELS,
} from "./metric-labels";

/** The parts of a rule its one-line summary and its settings rows read. */
export type RuleDefinitionView = Pick<
  AlertRule,
  "kind" | "metric" | "comparator" | "threshold" | "window_minutes" | "baseline_windows" | "filters"
>;

/** "15 min": a window inside a sentence. */
export function windowShort(minutes: number): string {
  return `${minutes} min`;
}

/** "15 minutes", "1 minute"; a cooldown of 0 reads "None". */
export function minutesLong(minutes: number): string {
  if (minutes === 0) {
    return "None";
  }
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** "high" for a rule that watches a value going up, "low" for one going down. */
export function anomalyDirection(rule: Pick<AlertRule, "comparator">): "high" | "low" {
  return isUpward(rule.comparator) ? "high" : "low";
}

/**
 * The summary line (spec copy): "error rate > 5 % over 15 min in production", or for an anomaly
 * rule "cost unusually high vs the last 12 windows". The environment part is left out when the
 * rule watches every environment; an unreadable threshold reads "—".
 */
export function ruleSummary(rule: RuleDefinitionView): string {
  const noun = METRIC_LABELS[rule.metric].noun;
  if (rule.kind === "anomaly") {
    const windows = rule.baseline_windows ?? "—";
    return `${noun} unusually ${anomalyDirection(rule)} vs the last ${windows} windows`;
  }
  const threshold = formatMetricValue(rule.metric, rule.threshold) ?? "—";
  const environment = rule.filters.environment;
  const scope = environment ? ` in ${environment}` : "";
  return `${noun} ${COMPARATOR_SYMBOLS[rule.comparator]} ${threshold} over ${windowShort(
    rule.window_minutes,
  )}${scope}`;
}

/** The settings card's "Condition" row: "Above 5 %", "At or below 1.5 s". */
export function conditionLabel(rule: Pick<AlertRule, "metric" | "comparator" | "threshold">) {
  const words = COMPARATOR_WORDS[rule.comparator];
  const threshold = formatMetricValue(rule.metric, rule.threshold) ?? "—";
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} ${threshold}`;
}

/** The settings card's "Direction" row for an anomaly rule: "Unusually high". */
export function directionLabel(rule: Pick<AlertRule, "comparator">): string {
  return `Unusually ${anomalyDirection(rule)}`;
}

/** "Error rate · last 15 min": what the state hero's value measures. */
export function measuredLabel(rule: Pick<AlertRule, "metric" | "window_minutes">): string {
  return `${METRIC_LABELS[rule.metric].label} · last ${windowShort(rule.window_minutes)}`;
}

export const RULE_KIND_LABELS: Record<AlertRule["kind"], string> = {
  threshold: "Threshold",
  anomaly: "Anomaly",
};
