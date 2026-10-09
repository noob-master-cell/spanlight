import { describe, expect, it } from "vitest";

import { safeNextPath } from "./search";

describe("safeNextPath", () => {
  it("allows same-origin relative paths", () => {
    expect(safeNextPath("/invite/abc")).toBe("/invite/abc");
    expect(safeNextPath("/o1/p1/traces?status=error")).toBe("/o1/p1/traces?status=error");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});
