import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Pill badges (Figma "Badge"). Tones: `neutral`, `success`, `warning`, `danger`,
 * `accent` (violet), `lime`, `ink`, `outline`. `violet` is an alias of `accent`.
 * Size `md` (25px, the Figma default) or `sm` (20px) for dense table cells.
 */
const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-full font-semibold whitespace-nowrap [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-surface-muted text-muted-foreground",
        success: "bg-success-subtle text-success",
        warning: "bg-warning-subtle text-warning",
        danger: "bg-danger-subtle text-danger-text",
        accent: "bg-accent-subtle text-accent",
        violet: "bg-accent-subtle text-accent",
        lime: "bg-lime text-lime-foreground",
        ink: "bg-hero-card text-hero-card-foreground",
        outline: "border border-border bg-surface text-foreground",
      },
      size: {
        sm: "h-5 px-2 text-2xs [&_svg]:size-3",
        md: "px-2.5 py-1 text-xs [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
    },
  },
);

interface BadgeProps extends ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
export type { BadgeProps };
