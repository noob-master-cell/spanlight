import { describe, expect, it } from "vitest";

import { fitScale } from "./use-fit-scale";

describe("fitScale", () => {
  it("shrinks a 1440px design into the available width", () => {
    expect(fitScale(1180, 1440)).toBeCloseTo(0.8194, 4);
    expect(fitScale(338, 1440)).toBeCloseTo(0.2347, 4);
  });

  it("scales up when there is more room than the design needs", () => {
    expect(fitScale(2880, 1440)).toBe(2);
  });

  it("is zero before the container has a width", () => {
    expect(fitScale(0, 1440)).toBe(0);
    expect(fitScale(1180, 0)).toBe(0);
  });
});
