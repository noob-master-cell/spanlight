import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { JsonViewer } from "./json-viewer";

describe("JsonViewer", () => {
  it("renders primitives and keys", () => {
    render(<JsonViewer value={{ model: "gpt-4o-mini", tokens: 12, stream: false, stop: null }} />);
    expect(screen.getByText('"model"')).toBeInTheDocument();
    expect(screen.getByText('"gpt-4o-mini"')).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("collapses deep nodes and expands them on click", async () => {
    const user = userEvent.setup();
    render(<JsonViewer value={{ a: { b: { c: "deep" } } }} defaultExpandDepth={2} />);

    expect(screen.queryByText('"deep"')).not.toBeInTheDocument();
    const collapsed = screen.getByRole("button", { expanded: false });
    await user.click(collapsed);
    expect(screen.getByText('"deep"')).toBeInTheDocument();
  });
});
