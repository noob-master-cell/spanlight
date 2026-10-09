import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Loading placeholder with a soft shimmer (static under reduced motion). Shape it like the
 * final content, e.g. `rounded-card h-48` for a card or `h-4 w-24` for a line of text.
 */
function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-md bg-surface-muted",
        "bg-linear-to-r from-surface-muted via-surface-hover to-surface-muted bg-size-[200%_100%]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
