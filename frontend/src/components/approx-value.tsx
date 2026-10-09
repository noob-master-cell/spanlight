import { ValueOrUnknown } from "@/components/unknown-value";

interface ApproxValueProps {
  /** The formatted value, or null when it is unknown. */
  value: string | null;
  /** True when the value is an estimate read from hourly rollups (the response's `approximate`). */
  approximate: boolean;
  /** Why the value is unknown; shown on the "—" instead of an "≈". */
  unknownReason: string;
  className?: string;
}

/**
 * A percentile (p50, p95, a model's latency) that may be an estimate. When `approximate` is
 * true it gets a "≈" prefix: the glyph is hidden from assistive tech and "approximately" is read
 * instead. The explanation lives in the page's one "Estimated · hourly rollups" chip, not here.
 * Counts, tokens and cost are exact sums and must not use this component. An unknown value stays
 * "—" with its reason, never "≈—".
 */
export function ApproxValue({ value, approximate, unknownReason, className }: ApproxValueProps) {
  if (!approximate || value === null || value === "") {
    return <ValueOrUnknown value={value} reason={unknownReason} className={className} />;
  }
  return (
    <span className={className}>
      <span aria-hidden className="mr-px text-subtle-foreground">
        ≈
      </span>
      <span className="sr-only">approximately </span>
      {value}
    </span>
  );
}
