import type { AlertRule } from "@/lib/api";

import { untilLabel } from "./alert-time";

export type RulePillTone = "firing" | "ok" | "muted" | "disabled" | "nodata";

export interface RulePill {
  tone: RulePillTone;
  label: string;
}

export const NO_DATA_REASON = "This rule hasn't been evaluated yet, or its metric had no data.";

type RuleStateView = Pick<AlertRule, "enabled" | "muted_until" | "state">;

/** The moment a mute ends, while it is still in the future; null when the rule is not muted. */
export function mutedUntil(rule: Pick<AlertRule, "muted_until">, now: Date): Date | null {
  if (rule.muted_until === null) {
    return null;
  }
  const until = new Date(rule.muted_until);
  return Number.isNaN(until.getTime()) || until.getTime() <= now.getTime() ? null : until;
}

/** Whether the rule's last evaluation breached, muted or not. */
export function isFiring(rule: Pick<AlertRule, "state">): boolean {
  return rule.state?.state === "firing";
}

/** "Muted until 20:15", or "Muted until Oct 11, 14:36" for a mute that ends on a later day. */
export function mutedLabel(until: Date, now: Date): string {
  return `Muted until ${untilLabel(until, now)}`;
}

/**
 * The state pill (spec copy): a disabled rule reads "Disabled"; a muted one "Muted until …"
 * (a muted rule that breaches also gets the "Still firing" badge); a rule never evaluated reads
 * "No data yet"; otherwise "Firing" or "OK".
 */
export function rulePill(rule: RuleStateView, now: Date): RulePill {
  if (!rule.enabled) {
    return { tone: "disabled", label: "Disabled" };
  }
  const until = mutedUntil(rule, now);
  if (until !== null) {
    return { tone: "muted", label: mutedLabel(until, now) };
  }
  if (rule.state === null) {
    return { tone: "nodata", label: "No data yet" };
  }
  return rule.state.state === "firing"
    ? { tone: "firing", label: "Firing" }
    : { tone: "ok", label: "OK" };
}

/** A muted rule that is breaching: shown with the "Still firing" badge so it never looks healthy. */
export function isStillFiring(rule: RuleStateView, now: Date): boolean {
  return rule.enabled && mutedUntil(rule, now) !== null && isFiring(rule);
}

/** Firing rules first (muted ones too, since they still breach), then by name. */
export function sortRules<T extends Pick<AlertRule, "name" | "state">>(rules: readonly T[]): T[] {
  return [...rules].sort((a, b) => {
    const firing = Number(isFiring(b)) - Number(isFiring(a));
    return firing !== 0 ? firing : a.name.localeCompare(b.name);
  });
}

/** "8 rules · 3 firing · checked every minute"; "0 rules" when there are none. */
export function rulesCountLine(rules: readonly Pick<AlertRule, "state">[]): string {
  if (rules.length === 0) {
    return "0 rules";
  }
  const firing = rules.filter(isFiring).length;
  const count = rules.length === 1 ? "1 rule" : `${rules.length} rules`;
  return `${count} · ${firing} firing · checked every minute`;
}
