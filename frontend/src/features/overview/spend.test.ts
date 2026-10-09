import { describe, expect, it } from "vitest";

import type { ModelMetrics } from "@/lib/api";

import {
  daysInMonth,
  formatCompactCost,
  formatShare,
  formatTileCost,
  peakIndex,
  projectMonthlySpend,
  relativeBucketLabel,
  relativeTickIndexes,
  shortModelLabel,
  splitCurrency,
  topModelsByCost,
} from "./spend";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

describe("splitCurrency", () => {
  it("splits dollars from cents, with thousands separators", () => {
    expect(splitCurrency(184.27)).toEqual({ whole: "$184", fraction: ".27" });
    expect(splitCurrency(12_345.6)).toEqual({ whole: "$12,345", fraction: ".60" });
    expect(splitCurrency(0)).toEqual({ whole: "$0", fraction: ".00" });
  });

  it("keeps sub-dollar amounts readable instead of rounding to $0.00", () => {
    expect(splitCurrency(0.0548776)).toEqual({ whole: "$0", fraction: ".0549" });
    expect(splitCurrency(0.000421)).toEqual({ whole: "$0", fraction: ".000421" });
  });
});

describe("projectMonthlySpend", () => {
  const october = new Date(2026, 9, 8);

  it("extrapolates the daily run rate over the days in this month", () => {
    expect(daysInMonth(october)).toBe(31);
    expect(projectMonthlySpend(184.27, DAY, october)).toBeCloseTo(184.27 * 31);
    expect(projectMonthlySpend(70, 7 * DAY, october)).toBeCloseTo(310);
    expect(projectMonthlySpend(10, HOUR, new Date(2026, 1, 3))).toBeCloseTo(10 * 24 * 28);
  });

  it("skips windows longer than a week and unknown spend", () => {
    expect(projectMonthlySpend(500, 30 * DAY, october)).toBeNull();
    expect(projectMonthlySpend(null, DAY, october)).toBeNull();
  });
});

describe("money formatting", () => {
  it("shortens large projections", () => {
    expect(formatCompactCost(5_712.37)).toBe("$5.7K");
    expect(formatCompactCost(42.5)).toBe("$42.50");
    expect(formatCompactCost(0.004)).toBe("<$0.01");
    expect(formatCompactCost(0)).toBe("$0.00");
  });

  it("rounds tile amounts to whole dollars from $10", () => {
    expect(formatTileCost(112.46)).toBe("$112");
    expect(formatTileCost(1_204.4)).toBe("$1,204");
    expect(formatTileCost(4.123)).toBe("$4.12");
    expect(formatTileCost(0.0494)).toBe("$0.05");
    expect(formatTileCost(0.0036)).toBe("<$0.01");
  });
});

describe("peakIndex", () => {
  it("finds the highest known bucket", () => {
    expect(peakIndex([1, 5, null, 3])).toBe(1);
  });

  it("prefers the most recent bucket on a tie", () => {
    expect(peakIndex([2, 4, 4, 1])).toBe(2);
  });

  it("has no peak without a value above zero", () => {
    expect(peakIndex([null, 0, null])).toBeNull();
    expect(peakIndex([])).toBeNull();
  });
});

describe("topModelsByCost", () => {
  function model(name: string, cost: string | null): ModelMetrics {
    return {
      provider: "anthropic",
      model: name,
      calls: 1,
      errors: 0,
      p50_ms: null,
      p95_ms: null,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: cost,
      approximate: false,
    };
  }

  it("returns the most expensive priced models with their share of spend", () => {
    const top = topModelsByCost([
      model("haiku", "25"),
      model("unpriced", null),
      model("sonnet", "112"),
      model("free", "0"),
      model("mini", "41"),
      model("tiny", "22"),
    ]);
    expect(top.map((entry) => entry.model)).toEqual(["sonnet", "mini", "haiku"]);
    expect(top[0]?.share).toBeCloseTo(112 / 200);
  });

  it("is empty when nothing is priced", () => {
    expect(topModelsByCost([model("a", null), model("b", "0")])).toEqual([]);
  });

  it("formats shares as whole percents", () => {
    expect(formatShare(0.614)).toBe("61%");
    expect(formatShare(0.003)).toBe("<1%");
    expect(formatShare(0)).toBe("0%");
  });
});

describe("shortModelLabel", () => {
  it("shortens familiar model ids", () => {
    expect(shortModelLabel("claude-sonnet-4-5")).toBe("Sonnet 4.5");
    expect(shortModelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    expect(shortModelLabel("gpt-4.1-mini")).toBe("4.1-mini");
  });

  it("leaves other ids alone", () => {
    expect(shortModelLabel("llama-3.3-70b")).toBe("llama-3.3-70b");
    expect(shortModelLabel("ft:custom-v2")).toBe("ft:custom-v2");
  });
});

describe("axis ticks", () => {
  it("labels the latest bucket and every step back, oldest first", () => {
    expect(relativeTickIndexes(25)).toEqual([0, 6, 12, 18, 24]);
    expect(relativeTickIndexes(8)).toEqual([1, 3, 5, 7]);
    expect(relativeTickIndexes(2)).toEqual([0, 1]);
    expect(relativeTickIndexes(0)).toEqual([]);
  });

  it("names buckets relative to now", () => {
    expect(relativeBucketLabel(0, "hour")).toBe("Now");
    expect(relativeBucketLabel(6, "hour")).toBe("−6h");
    expect(relativeBucketLabel(0, "day")).toBe("Today");
    expect(relativeBucketLabel(2, "day")).toBe("−2d");
  });
});
