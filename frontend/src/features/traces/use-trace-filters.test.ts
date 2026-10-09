import { describe, expect, it } from "vitest";

import { activeFiltersOf } from "./use-trace-filters";

describe("activeFiltersOf", () => {
  it("lists the environment first, then facets in a stable order", () => {
    expect(
      activeFiltersOf({ q: "refund", model: "gpt-4.1-mini", env: "production", status: "error" }),
    ).toEqual([
      { key: "env", label: "Environment", value: "production" },
      { key: "status", label: "Status", value: "Error" },
      { key: "model", label: "Model", value: "gpt-4.1-mini" },
      { key: "q", label: "Search", value: "refund" },
    ]);
  });

  it("skips empty values and ignores the time range", () => {
    expect(activeFiltersOf({ range: "7d", tag: "", user: "u_8f21" })).toEqual([
      { key: "user", label: "User", value: "u_8f21" },
    ]);
  });
});
