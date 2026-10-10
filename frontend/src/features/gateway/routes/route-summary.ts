import type { GatewayKey, RouteConfig, User } from "@/lib/api";
import { pluralize } from "@/lib/format";

import { WEIGHT_MAX, WEIGHT_MIN } from "./route-form";

/** The list row's sub-line, e.g. "2 targets · 2 attempts · fallback on 4 conditions · 60 s timeout". */
export function routeSummary(config: RouteConfig): string {
  const parts = [
    pluralize(config.targets.length, "target", "targets"),
    pluralize(config.retry.max_attempts ?? 2, "attempt", "attempts"),
  ];
  const fallbackOn = config.fallback.on?.length ?? 4;
  if (config.targets.length > 1) {
    parts.push(
      fallbackOn === 0
        ? "no fallback"
        : `fallback on ${pluralize(fallbackOn, "condition", "conditions")}`,
    );
  }
  const timeoutMs = config.timeout_ms ?? 60_000;
  parts.push(`${(timeoutMs / 1000).toLocaleString("en-US")} s timeout`);
  return parts.join(" · ");
}

/**
 * Each target's share of first picks (0–1), from the weights. Only the first pick is weighted;
 * fallbacks follow the list order. Null for every target while any weight is not a valid whole
 * number from 1 to 100, since the shares are then undefined.
 */
export function firstPickShares(weights: readonly number[]): (number | null)[] {
  const valid = weights.every(
    (weight) => Number.isInteger(weight) && weight >= WEIGHT_MIN && weight <= WEIGHT_MAX,
  );
  if (!valid || weights.length === 0) {
    return weights.map(() => null);
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

/**
 * The gateway keys that send calls through the route: active keys pointing at it. A key always
 * stores its route (the default is resolved when it is created); only a revoked key can be
 * without one, and a revoked key sends nothing.
 */
/**
 * The shares as whole percents that add up to exactly 100, by largest remainder: each target gets
 * its rounded-down percent, and the points left go to the largest fractions (earlier targets win
 * ties). Three equal weights read 34 %, 33 %, 33 %, not 33 % three times.
 */
export function firstPickPercents(weights: readonly number[]): (number | null)[] {
  const shares = firstPickShares(weights);
  if (shares.some((share) => share === null)) {
    return shares.map(() => null);
  }
  const exact = shares.map((share) => (share ?? 0) * 100);
  const percents = exact.map((value) => Math.floor(value));
  let left = 100 - percents.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (left <= 0) {
      break;
    }
    percents[index] = (percents[index] ?? 0) + 1;
    left -= 1;
  }
  return percents;
}

export function keysUsingRoute(keys: readonly GatewayKey[], routeId: string): GatewayKey[] {
  return keys.filter((key) => key.revoked_at === null && key.route_id === routeId);
}

export function keyCountLabel(count: number): string {
  return count === 0 ? "No keys" : pluralize(count, "key", "keys");
}

/** "Priya Raman", or the email when the account has no name. */
export function userName(user: User): string {
  return user.name.trim() === "" ? user.email : user.name;
}
