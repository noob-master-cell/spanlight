import { describe, expect, it } from "vitest";

import type { ResolvedRange } from "@/lib/time-range";

import { loadedSummary, rangePhrase, tracesNoun } from "./list-summary";

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

describe("loadedSummary", () => {
  it("shows loaded of total for an unfiltered list", () => {
    expect(loadedSummary({ loaded: 50, total: 12_904, filtered: false, hasNextPage: true })).toBe(
      "Showing 50 of 12,904 traces",
    );
    expect(loadedSummary({ loaded: 1, total: 1, filtered: false, hasNextPage: false })).toBe(
      "Showing 1 of 1 trace",
    );
  });

  it("drops the window total when facet filters narrow the list", () => {
    expect(loadedSummary({ loaded: 50, total: 900, filtered: true, hasNextPage: true })).toBe(
      "Showing 50 matching traces",
    );
    expect(loadedSummary({ loaded: 3, total: 900, filtered: true, hasNextPage: false })).toBe(
      "All 3 matching traces loaded",
    );
    expect(loadedSummary({ loaded: 1, total: 900, filtered: true, hasNextPage: false })).toBe(
      "1 matching trace",
    );
  });

  it("never claims more rows than the total while the total is unknown or stale", () => {
    expect(loadedSummary({ loaded: 50, total: null, filtered: false, hasNextPage: true })).toBe(
      "Showing 50 traces",
    );
    expect(loadedSummary({ loaded: 52, total: 50, filtered: false, hasNextPage: false })).toBe(
      "All 52 traces loaded",
    );
  });
});

describe("tracesNoun", () => {
  it("is singular only for one", () => {
    expect(tracesNoun(0)).toBe("traces");
    expect(tracesNoun(1)).toBe("trace");
    expect(tracesNoun(2)).toBe("traces");
  });
});
