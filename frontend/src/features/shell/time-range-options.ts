import { RANGE_PRESETS, type RangePreset } from "@/lib/time-range";

/** Which windows a page's time-range control offers. */
export interface TimeRangeOptions {
  presets: readonly RangePreset[];
  /** Whether the calendar pill for a custom from/to range is shown. */
  allowCustom: boolean;
  /**
   * The preset the page reads when the shared range is one it doesn't offer (30 d or custom from
   * another page). The picker shows it as selected; the URL keeps the shared range for the other
   * pages.
   */
  fallback?: RangePreset;
}

export const DEFAULT_TIME_RANGE_OPTIONS: TimeRangeOptions = {
  presets: RANGE_PRESETS,
  allowCustom: true,
};

/**
 * The gateway overview endpoint accepts at most 7 days, so no 30 d and no custom range; a shared
 * range it doesn't offer reads as the last 7 days.
 */
export const GATEWAY_TIME_RANGE_OPTIONS = {
  presets: ["1h", "24h", "7d"],
  allowCustom: false,
  fallback: "7d",
} as const satisfies TimeRangeOptions;
