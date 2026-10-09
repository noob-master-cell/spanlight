import { cn } from "@/lib/utils";

import { buildSparkline, SPARKLINE_BOX } from "./sparkline-path";

export type SparklineTone = "calls" | "errors" | "latency" | "on-accent";

const TONE_COLORS: Record<SparklineTone, string> = {
  calls: "var(--chart-1)",
  errors: "var(--chart-2)",
  latency: "var(--chart-3)",
  "on-accent": "var(--accent-card-foreground)",
};

interface SparklineProps {
  values: readonly (number | null)[];
  tone: SparklineTone;
  className?: string;
}

/**
 * The trend line in a KPI card (Figma "Sparkline/*"): a 2px rounded stroke with a dot on the
 * latest value. Decorative: the card's value and delta pill carry the meaning, so it is hidden
 * from assistive technology. With no data it falls back to the dashed "empty" line.
 */
export function Sparkline({ values, tone, className }: SparklineProps) {
  const { paths, end } = buildSparkline(values);
  const color = TONE_COLORS[tone];
  const { width, height } = SPARKLINE_BOX;

  if (paths.length === 0 && end === null) {
    return <EmptySparkline className={className} />;
  }

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={cn("block shrink-0 overflow-visible", className)}
    >
      {paths.map((path, index) => (
        <path
          key={index}
          d={path}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {end ? <circle cx={end.x} cy={end.y} r={3} fill={color} /> : null}
    </svg>
  );
}

/** Figma "Sparkline/Empty": a dashed baseline for KPIs with no data yet. */
export function EmptySparkline({ className }: { className?: string }) {
  const { width, height } = SPARKLINE_BOX;
  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={cn("block shrink-0", className)}
    >
      <path
        d={`M3 ${height / 2}H${width - 3}`}
        stroke="var(--border-strong)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="3 5"
      />
    </svg>
  );
}
