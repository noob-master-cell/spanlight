import { z } from "zod";

import type { Bucket } from "@/lib/api";

export const RANGE_PRESETS = ["1h", "24h", "7d", "30d"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export type RangeValue = RangePreset | "custom";

export const RANGE_LABELS: Record<RangeValue, string> = {
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom range",
};

const PRESET_MS: Record<RangePreset, number> = {
  "1h": 3600_000,
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
};

/** The API rejects windows longer than this. */
export const MAX_WINDOW_MS = 90 * 24 * 3600_000;

/** Search params shared by every project page: `?range=7d&env=prod`. */
export const projectSearchSchema = z.object({
  range: z.enum(["1h", "24h", "7d", "30d", "custom"]).optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  env: z.string().optional().catch(undefined),
});

export type ProjectSearch = z.infer<typeof projectSearchSchema>;

export interface ResolvedRange {
  value: RangeValue;
  from: string;
  to: string;
  durationMs: number;
}

/**
 * Rounds up to the start of the next minute, so the window includes data
 * recorded earlier in the current minute (a just-sent trace must be visible).
 */
function ceilToNextMinute(date: Date): Date {
  const copy = new Date(date);
  copy.setSeconds(0, 0);
  copy.setMinutes(copy.getMinutes() + 1);
  return copy;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Turns URL search params into a concrete [from, to] window. "now" is rounded
 * up to the next minute so query keys stay stable between renders and data
 * refreshes naturally once a minute.
 */
export function resolveRange(search: ProjectSearch, now: Date = new Date()): ResolvedRange {
  if (search.range === "custom") {
    const from = parseDate(search.from);
    const to = parseDate(search.to);
    if (from && to && from < to && to.getTime() - from.getTime() <= MAX_WINDOW_MS) {
      return {
        value: "custom",
        from: from.toISOString(),
        to: to.toISOString(),
        durationMs: to.getTime() - from.getTime(),
      };
    }
  }

  const preset: RangePreset = search.range && search.range !== "custom" ? search.range : "24h";
  const to = ceilToNextMinute(now);
  const from = new Date(to.getTime() - PRESET_MS[preset]);
  return {
    value: preset,
    from: from.toISOString(),
    to: to.toISOString(),
    durationMs: PRESET_MS[preset],
  };
}

export function bucketFor(durationMs: number): Bucket {
  return durationMs <= 2 * 24 * 3600_000 ? "hour" : "day";
}

export function describeRange(range: ResolvedRange): string {
  if (range.value !== "custom") {
    return RANGE_LABELS[range.value];
  }
  const format = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${format.format(new Date(range.from))} – ${format.format(new Date(range.to))}`;
}

/** `<input type="datetime-local">` wants local time without a zone: 2026-10-07T14:30 */
export function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
