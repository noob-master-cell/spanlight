export type DeltaTone = "good" | "bad" | "neutral";

/**
 * Whether a change is good news. `increaseIsGood` is true when more is better, false for errors,
 * latency and cost, and null for volume metrics (calls, tokens), where a change is neither good
 * nor bad. Zero, null and non-finite deltas are neutral too.
 */
export function deltaTone(delta: number | null, increaseIsGood: boolean | null): DeltaTone {
  if (increaseIsGood === null || delta === null || !Number.isFinite(delta) || delta === 0) {
    return "neutral";
  }
  const increased = delta > 0;
  return increased === increaseIsGood ? "good" : "bad";
}

/** "+12.4%" / "−3 ms" / "0%": a typographic minus sign and an explicit plus. */
export function signedDelta(delta: number, format: (absolute: number) => string): string {
  if (delta === 0) {
    return format(0);
  }
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${format(Math.abs(delta))}`;
}
