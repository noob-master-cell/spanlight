import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo, LogoMark } from "./logo";

/** The visible letters: a dotless ı, so the dot can be drawn (and lit) separately. */
const LETTERS = "spanlıght";

function rectGeometry(rect: SVGRectElement) {
  return ["x", "y", "width", "height", "rx"].map((name) => rect.getAttribute(name)).join(" ");
}

describe("Logo", () => {
  it("is named Spanlight exactly once", () => {
    render(
      <a href="/">
        <Logo />
      </a>,
    );
    expect(screen.getByRole("link")).toHaveAccessibleName("Spanlight");
    expect(screen.getByRole("img", { name: "Spanlight" })).toBeInTheDocument();
  });

  it("draws a single-line lowercase wordmark that assistive tech skips", () => {
    render(<Logo />);
    const letters = screen.getByText(LETTERS);
    expect(letters.closest('[aria-hidden="true"]')).not.toBeNull();
    // A tight line box keeps the wordmark centred on the mark; tailwind-merge drops a
    // line height that comes before a font size.
    expect(letters).toHaveClass("leading-none");
  });

  it("lights the dot of the i lime on the dark rail", () => {
    render(<Logo tone="on-dark" />);
    const letters = screen.getByText(LETTERS);
    expect(letters).toHaveClass("text-rail-foreground");
    expect(letters.querySelector(".rounded-full")).toHaveClass("bg-lime");
  });

  it("draws the dot of the i in the text colour on light surfaces", () => {
    render(<Logo />);
    const letters = screen.getByText(LETTERS);
    expect(letters).toHaveClass("text-foreground");
    expect(letters.querySelector(".rounded-full")).toHaveClass("bg-current");
  });

  it("uses the bare mark on the dark rail and the ink tile on light surfaces", () => {
    const { rerender } = render(<Logo tone="on-dark" />);
    expect(screen.getByRole("img", { name: "Spanlight" }).querySelector(".bg-rail")).toBeNull();

    rerender(<Logo tone="on-light" />);
    expect(screen.getByRole("img", { name: "Spanlight" }).querySelector(".bg-rail")).not.toBeNull();
  });

  it("can show the mark alone and keeps its name", () => {
    render(<Logo withWordmark={false} />);
    expect(screen.getByRole("img", { name: "Spanlight" }).querySelector("svg")).not.toBeNull();
    expect(screen.queryByText(LETTERS)).toBeNull();
  });
});

describe("LogoMark", () => {
  it("draws the lamp, the unlit span and the lit span", () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 32 32");
    expect([...container.querySelectorAll("rect")].map(rectGeometry)).toEqual([
      "12.5 3.5 7 3.5 1.75",
      "3 23 26 5 2.5",
      "9 23 14 5 2.5",
    ]);
  });

  it("casts a beam that fades from 85% to 20% lime", () => {
    const { container } = render(<LogoMark />);
    expect(container.querySelector("path")).toHaveAttribute("d", "M13.5 8.5H18.5L23 23H9Z");

    const gradient = container.querySelector("linearGradient");
    expect(gradient).toHaveAttribute("gradientUnits", "userSpaceOnUse");
    expect(["x1", "y1", "x2", "y2"].map((name) => gradient?.getAttribute(name)).join(" ")).toBe(
      "16 8 16 23",
    );
    expect(
      [...container.querySelectorAll("stop")].map((stop) => stop.getAttribute("stop-opacity")),
    ).toEqual(["0.85", "0.2"]);
  });

  it("gives every instance its own beam gradient", () => {
    const { container } = render(
      <>
        <LogoMark />
        <LogoMark tone="on-dark" />
      </>,
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((gradient) => gradient.id);
    expect(new Set(ids).size).toBe(2);
    expect(
      [...container.querySelectorAll("path")].map((path) => path.getAttribute("fill")),
    ).toEqual(ids.map((id) => `url(#${id})`));
  });

  it("sits on a rounded ink tile at 72% on light surfaces", () => {
    const { container } = render(<LogoMark />);
    const tile = container.firstElementChild;
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile).toHaveClass("size-8", "rounded-[24%]", "bg-rail");
    expect(tile?.querySelector("svg")).toHaveClass("size-[72%]");
  });

  it("is bare on the dark rail", () => {
    const { container } = render(<LogoMark tone="on-dark" />);
    const mark = container.firstElementChild;
    expect(mark).toHaveClass("size-8");
    expect(mark).not.toHaveClass("bg-rail");
    expect(mark?.querySelector("svg")).toHaveClass("size-full");
  });

  it("grows to 40px for the mobile app bar", () => {
    const { container } = render(<LogoMark size="lg" />);
    expect(container.firstElementChild).toHaveClass("size-10");
  });
});
