import { describe, expect, it } from "vitest";

import {
  bucketFor,
  projectSearchSchema,
  rangePhrase,
  resolveRange,
  type ResolvedRange,
} from "./time-range";

const NOW = new Date("2026-10-07T12:34:56.789Z");

describe("resolveRange", () => {
  it("defaults to the last 24 hours, rounded up to the next minute", () => {
    const range = resolveRange({}, NOW);
    expect(range.value).toBe("24h");
    expect(range.to).toBe("2026-10-07T12:35:00.000Z");
    expect(range.from).toBe("2026-10-06T12:35:00.000Z");
  });

  it("includes data recorded earlier in the current minute", () => {
    const range = resolveRange({}, NOW);
    expect(new Date(range.to).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("resolves presets", () => {
    const range = resolveRange({ range: "7d" }, NOW);
    expect(range.from).toBe("2026-09-30T12:35:00.000Z");
    expect(bucketFor(range.durationMs)).toBe("day");
    expect(bucketFor(resolveRange({ range: "1h" }, NOW).durationMs)).toBe("hour");
  });

  it("accepts a valid custom range", () => {
    const range = resolveRange(
      { range: "custom", from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z" },
      NOW,
    );
    expect(range.value).toBe("custom");
    expect(range.from).toBe("2026-10-01T00:00:00.000Z");
  });

  it("falls back to 24h for an inverted or oversized custom range", () => {
    expect(
      resolveRange(
        { range: "custom", from: "2026-10-02T00:00:00Z", to: "2026-10-01T00:00:00Z" },
        NOW,
      ).value,
    ).toBe("24h");
    expect(
      resolveRange(
        { range: "custom", from: "2026-01-01T00:00:00Z", to: "2026-10-01T00:00:00Z" },
        NOW,
      ).value,
    ).toBe("24h");
  });
});

describe("projectSearchSchema", () => {
  it("drops invalid values instead of throwing", () => {
    expect(projectSearchSchema.parse({ range: "13d", env: "prod" })).toEqual({
      range: undefined,
      env: "prod",
    });
  });
});

function preset(value: ResolvedRange["value"]): ResolvedRange {
  return {
    value,
    from: "2026-10-07T00:00:00.000Z",
    to: "2026-10-08T00:00:00.000Z",
    durationMs: 24 * 3600_000,
  };
}

describe("rangePhrase", () => {
  it("lower-cases preset labels", () => {
    expect(rangePhrase(preset("24h"))).toBe("in the last 24 hours");
    expect(rangePhrase(preset("1h"))).toBe("in the last hour");
  });

  it("describes a custom window with its bounds", () => {
    expect(rangePhrase(preset("custom"))).toMatch(/^from Oct \d+, \d\d:\d\d – Oct \d+, \d\d:\d\d$/);
  });
});
