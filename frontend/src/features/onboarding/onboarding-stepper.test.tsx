import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OnboardingStepper } from "./onboarding-stepper";

function steps() {
  const nav = screen.getByRole("navigation", { name: "Setup progress" });
  return within(nav).getAllByRole("listitem");
}

describe("OnboardingStepper", () => {
  it("marks the current step and announces completed ones", () => {
    render(<OnboardingStepper progress="project" />);
    const [org, project, connect] = steps();
    expect(org).toHaveTextContent("Step 1: Organization, completed");
    expect(org).not.toHaveAttribute("aria-current");
    expect(project).toHaveAttribute("aria-current", "step");
    expect(project).toHaveTextContent("Step 2: Project");
    expect(connect).toHaveTextContent("Step 3: Connect");
    expect(connect).not.toHaveTextContent("completed");
  });

  it("shows every step completed once the first trace arrived", () => {
    render(<OnboardingStepper progress="complete" />);
    for (const step of steps()) {
      expect(step).toHaveTextContent("completed");
      expect(step).not.toHaveAttribute("aria-current");
    }
  });
});
