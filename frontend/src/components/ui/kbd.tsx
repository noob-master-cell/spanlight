import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Keyboard hint chip, e.g. ⌘K in the search pill. */
function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-surface-muted px-1.5 font-mono text-2xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
