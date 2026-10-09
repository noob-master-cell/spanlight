import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("merges custom font sizes as sizes, not colours", () => {
    expect(cn("text-sm text-foreground", "text-label")).toBe("text-foreground text-label");
    expect(cn("text-display", "text-h1")).toBe("text-h1");
  });

  it("merges custom radii and shadows", () => {
    expect(cn("rounded-md", "rounded-card")).toBe("rounded-card");
    expect(cn("shadow-card", "shadow-none")).toBe("shadow-none");
  });
});
