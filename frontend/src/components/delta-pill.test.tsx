import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeltaPill } from "./delta-pill";

describe("DeltaPill", () => {
  it("colours a cost drop as good news and announces it", () => {
    render(<DeltaPill delta={-12.4} increaseIsGood={false} comparisonLabel="vs previous 24h" />);
    const pill = screen.getByText("−12.4%");
    expect(pill).toHaveClass("bg-success-subtle");
    expect(pill).toHaveTextContent("improvement, vs previous 24h");
  });

  it("uses lime for good news on ink hero cards", () => {
    render(<DeltaPill delta={8} increaseIsGood surface="ink" format={(v) => `${v} pt`} />);
    expect(screen.getByText("+8 pt")).toHaveClass("bg-lime");
  });

  it("announces a flat change for metrics with a direction", () => {
    render(<DeltaPill delta={0} increaseIsGood={false} comparisonLabel="vs previous 24h" />);
    expect(screen.getByText("0.0%")).toHaveTextContent("no change, vs previous 24h");
  });

  it("keeps volume changes neutral and announces only the comparison", () => {
    render(<DeltaPill delta={12} increaseIsGood={null} comparisonLabel="vs previous 24h" />);
    const pill = screen.getByText("+12.0%");
    expect(pill).toHaveClass("bg-surface-muted", "text-muted-foreground");
    expect(pill.textContent).toBe("+12.0% (vs previous 24h)");
  });

  it("uses an ink pill on the gradient accent card", () => {
    render(
      <DeltaPill
        delta={-3}
        increaseIsGood={null}
        surface="accent"
        comparisonLabel="vs previous 24h"
      />,
    );
    expect(screen.getByText("−3.0%")).toHaveClass("bg-hero-card", "text-hero-card-foreground");
  });

  it("has nothing extra to announce for a volume change without a comparison label", () => {
    render(<DeltaPill delta={5} increaseIsGood={null} />);
    expect(screen.getByText("+5.0%").textContent).toBe("+5.0%");
  });

  it("renders nothing without a comparison", () => {
    const { container } = render(<DeltaPill delta={null} increaseIsGood />);
    expect(container).toBeEmptyDOMElement();
  });
});
