import type { Health, HealthComponent } from "@/lib/api";
import { formatCost, formatDuration, formatInteger, formatPercent, pluralize } from "@/lib/format";

/** Shown (as the "—" tooltip) when the window has no LLM calls, so there is nothing to score. */
export const NO_SCORE_REASON = "No LLM calls in this window";

/** The last line of the tooltip: how the score is made. */
export const FORMULA_LINE = "100 minus penalties for findings, errors, latency and cost";
/** `Health.approximate`: some of the metrics behind the score come from hourly rollups. */
export const APPROXIMATE_LINE = "Approximate: some figures come from hourly rollups.";

export type HealthBand = "good" | "fair" | "poor" | "none";

export const BAND_LABELS: Record<HealthBand, string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  none: "No score",
};

/** 80 and up is good, 50 to 79 fair, below that poor; `null` has no band. */
export function healthBand(value: number | null): HealthBand {
  if (value === null) {
    return "none";
  }
  if (value >= 80) {
    return "good";
  }
  return value >= 50 ? "fair" : "poor";
}

const COMPONENT_LABELS: Record<string, string> = {
  findings: "Open findings",
  errors: "Errors",
  latency: "Latency",
  cost: "Cost",
};

export function componentLabel(name: string): string {
  return COMPONENT_LABELS[name] ?? name;
}

function toNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A component's observed or baseline value in its own unit: the error rate is a fraction shown as
 * a percent, latency is milliseconds, cost is dollars, findings a count. `null` when unknown.
 */
export function formatComponentValue(name: string, value: string | null): string | null {
  const parsed = toNumber(value);
  if (parsed === null) {
    return null;
  }
  switch (name) {
    case "errors":
      return formatPercent(parsed);
    case "latency":
      return formatDuration(parsed);
    case "cost":
      return formatCost(value);
    case "findings":
      return formatInteger(parsed);
    default:
      return value;
  }
}

/** "p95 1.84 s vs 1.62 s baseline"-style detail; `null` when the component has no observed value. */
export function componentDetail(component: HealthComponent): string | null {
  const observed = formatComponentValue(component.name, component.observed);
  if (observed === null) {
    return null;
  }
  const baseline = formatComponentValue(component.name, component.baseline);
  return baseline === null ? observed : `${observed} vs ${baseline} baseline`;
}

export interface PenaltyRow {
  name: string;
  label: string;
  /** "−20" with a true minus sign. */
  penalty: string;
  detail: string | null;
}

/** The tooltip rows: only components that took points off, in the API's order. */
export function penaltyRows(components: readonly HealthComponent[]): PenaltyRow[] {
  return components
    .filter((component) => component.penalty > 0)
    .map((component) => ({
      name: component.name,
      label: componentLabel(component.name),
      penalty: `−${component.penalty}`,
      detail: componentDetail(component),
    }));
}

/**
 * "2 open findings (1 critical, 1 warning) · last 24h". Open findings are shown even when the
 * window had no LLM calls (the score is then "—" but the findings are real).
 */
export function summaryLine(health: Health, rangeLabel: string): string {
  const open = health.open_critical + health.open_warning;
  const parts: string[] = [];
  if (health.value === null) {
    parts.push("No LLM calls");
  }
  if (open > 0) {
    const kinds: string[] = [];
    if (health.open_critical > 0) {
      kinds.push(`${health.open_critical} critical`);
    }
    if (health.open_warning > 0) {
      kinds.push(`${health.open_warning} warning`);
    }
    parts.push(`${pluralize(open, "open finding")} (${kinds.join(", ")})`);
  } else if (health.value !== null) {
    parts.push("No open findings");
  }
  return `${parts.join(" · ")} · ${rangeLabel}`;
}

/** The share of the ring to fill, 0 to 1. */
export function ringFraction(value: number | null): number {
  return value === null ? 0 : Math.max(0, Math.min(100, value)) / 100;
}
