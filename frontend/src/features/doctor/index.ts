/**
 * What other features may use from `features/doctor`: the insights query and the severity
 * wording and styling (the trace page's insight chips). Import from this file, not from the
 * modules behind it.
 */
export type { InsightQuery } from "./insight-filters";
export { useProjectInsights } from "./doctor-queries";
export { SEVERITY_LABELS } from "./insight-format";
export { SEVERITY_STYLE } from "./severity-style";
