import { describe, expect, it } from "vitest";

import { avatarInitial, avatarTone } from "./avatar-tone";

describe("avatarTone", () => {
  it("gives the same person the same tint every time", () => {
    const id = "01a11862-b256-715b-9440-13e9978b95a9";
    expect(avatarTone(id)).toBe(avatarTone(id));
  });

  it("spreads different people across the tints", () => {
    const tones = new Set(
      ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9", "u10"].map(avatarTone),
    );
    expect(tones.size).toBeGreaterThan(2);
  });
});

describe("avatarInitial", () => {
  it("uppercases the first letter of a name or email", () => {
    expect(avatarInitial("dheeraj Karwasra")).toBe("D");
    expect(avatarInitial("  priya@example.com")).toBe("P");
  });

  it("keeps characters outside the Basic Multilingual Plane whole", () => {
    expect(avatarInitial("𝒜da")).toBe("𝒜");
  });

  it("falls back to a question mark", () => {
    expect(avatarInitial("   ")).toBe("?");
  });
});
