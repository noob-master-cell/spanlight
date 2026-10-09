import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { ValueOrUnknown } from "./unknown-value";

function renderWithTooltip(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("ValueOrUnknown", () => {
  it("renders the value when known", () => {
    renderWithTooltip(<ValueOrUnknown value="$0.0042" reason="No price for this model" />);
    expect(screen.getByText("$0.0042")).toBeInTheDocument();
  });

  it("renders an explained dash instead of a fake zero", () => {
    renderWithTooltip(<ValueOrUnknown value={null} reason="No price for this model" />);
    const placeholder = screen.getByLabelText("Unknown: No price for this model");
    expect(placeholder).toHaveTextContent("—");
    expect(placeholder).toHaveAttribute("tabindex", "0");
  });
});
