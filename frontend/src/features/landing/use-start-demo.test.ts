import { describe, expect, it } from "vitest";

import { ApiError, NetworkError } from "@/lib/api";

import {
  DEMO_NOT_CONFIGURED_MESSAGE,
  DEMO_RATE_LIMITED_MESSAGE,
  demoErrorMessage,
} from "./use-start-demo";

describe("demoErrorMessage", () => {
  it("explains that the demo is not configured when the endpoint is missing", () => {
    expect(demoErrorMessage(new ApiError(404, { code: "NOT_FOUND" }))).toBe(
      DEMO_NOT_CONFIGURED_MESSAGE,
    );
  });

  it("asks rate-limited visitors to come back later", () => {
    expect(demoErrorMessage(new ApiError(429, { code: "RATE_LIMITED" }))).toBe(
      DEMO_RATE_LIMITED_MESSAGE,
    );
  });

  it("falls back to the API error message", () => {
    expect(demoErrorMessage(new ApiError(500, { detail: "Database unavailable" }))).toBe(
      "Database unavailable",
    );
    expect(demoErrorMessage(new NetworkError(new TypeError("fetch failed")))).toBe(
      "Can't reach the server. Check your connection and try again.",
    );
    expect(demoErrorMessage(new Error("boom"))).toBe("Something went wrong. Try again.");
  });
});
