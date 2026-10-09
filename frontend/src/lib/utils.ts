import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's default scale. Register the custom theme keys from
 * globals.css so `text-label` is merged as a font size (not a colour), `rounded-card` as a
 * radius and `shadow-card` as a shadow.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "2xs",
        "overline",
        "label",
        "card",
        "h2",
        "h1",
        "metric",
        "display",
        "serif",
        "display-hero",
        "metric-xl",
        "serif-hero",
        "code",
      ],
      radius: ["input", "tile", "popover", "dialog", "card"],
      shadow: ["card", "focus", "focus-danger"],
    },
    classGroups: {
      "font-family": ["font-serif-accent"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
