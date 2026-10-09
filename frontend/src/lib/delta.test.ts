import { describe, expect, it } from "vitest";

import { deltaTone, signedDelta } from "./delta";

describe("deltaTone", () => {
  it("treats a rise as good only when increases are good", () => {
    expect(deltaTone(12, true)).toBe("good");
    expect(deltaTone(12, false)).toBe("bad");
    expect(deltaTone(-3, true)).toBe("bad");
    expect(deltaTone(-3, false)).toBe("good");
  });

  it("is neutral without a real change", () => {
    expect(deltaTone(0, true)).toBe("neutral");
    expect(deltaTone(null, false)).toBe("neutral");
    expect(deltaTone(Number.NaN, true)).toBe("neutral");
    expect(deltaTone(Number.POSITIVE_INFINITY, true)).toBe("neutral");
  });

  it("is always neutral for volume metrics, where a change is neither good nor bad", () => {
    expect(deltaTone(12, null)).toBe("neutral");
    expect(deltaTone(-3, null)).toBe("neutral");
  });
});

describe("signedDelta", () => {
  const percent = (value: number) => `${value.toFixed(1)}%`;

  it("adds a plus or a typographic minus", () => {
    expect(signedDelta(12.4, percent)).toBe("+12.4%");
    expect(signedDelta(-0.1, percent)).toBe("−0.1%");
  });

  it("leaves zero unsigned", () => {
    expect(signedDelta(0, percent)).toBe("0.0%");
  });
});
