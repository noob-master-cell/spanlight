import { describe, expect, it } from "vitest";

import {
  formatCompact,
  formatCost,
  formatDuration,
  formatPercent,
  formatRelativeTime,
  parseMoney,
  relativeChange,
} from "./format";

describe("formatDuration", () => {
  it("returns null for unknown values", () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });

  it("formats milliseconds, seconds and minutes", () => {
    expect(formatDuration(0.4)).toBe("<1 ms");
    expect(formatDuration(842.3)).toBe("842 ms");
    expect(formatDuration(4213)).toBe("4.21 s");
    expect(formatDuration(42_100)).toBe("42.1 s");
    expect(formatDuration(123_000)).toBe("2m 03s");
  });
});

describe("money", () => {
  it("parses decimal strings and rejects garbage", () => {
    expect(parseMoney("0.00012300")).toBeCloseTo(0.000123);
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });

  it("keeps unknown cost unknown instead of $0", () => {
    expect(formatCost(null)).toBeNull();
    expect(formatCost("0")).toBe("$0.00");
  });

  it("uses more precision for small amounts", () => {
    expect(formatCost("12.3456")).toBe("$12.35");
    expect(formatCost("0.1234")).toBe("$0.1234");
    expect(formatCost("0.000123")).toBe("$0.000123");
  });
});

describe("numbers", () => {
  it("formats compact counts", () => {
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(12_345)).toBe("12.3K");
    expect(formatCompact(null)).toBeNull();
  });

  it("formats ratios as percentages", () => {
    expect(formatPercent(0.0234)).toBe("2.3%");
    expect(formatPercent(null)).toBeNull();
  });
});

describe("relativeChange", () => {
  it("computes the change between periods", () => {
    expect(relativeChange(120, 100)).toBeCloseTo(0.2);
    expect(relativeChange(50, 100)).toBeCloseTo(-0.5);
  });

  it("is unknown when the previous period is zero or missing", () => {
    expect(relativeChange(10, 0)).toBeNull();
    expect(relativeChange(10, null)).toBeNull();
    expect(relativeChange(null, 10)).toBeNull();
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-10-07T12:00:00Z");

  it("describes past times", () => {
    expect(formatRelativeTime("2026-10-07T11:55:00Z", now)).toBe("5 minutes ago");
    expect(formatRelativeTime("2026-10-06T12:00:00Z", now)).toBe("yesterday");
    expect(formatRelativeTime("2026-10-07T11:59:40Z", now)).toBe("just now");
  });

  it("returns null for invalid input", () => {
    expect(formatRelativeTime("not a date", now)).toBeNull();
    expect(formatRelativeTime(null, now)).toBeNull();
  });
});
