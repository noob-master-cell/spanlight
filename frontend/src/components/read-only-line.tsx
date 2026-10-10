import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface ReadOnlyLineProps {
  /** Why the person can't change this, e.g. "Only admins and owners can change alerts". */
  children: ReactNode;
  /** `md` sits beside a full-size button (Explain); `sm` under toolbars and fields. */
  size?: "sm" | "md";
  /** Lets disabled controls point at this line with `aria-describedby`. */
  id?: string;
}

/**
 * Figma read-only line: a lock and the reason as visible text. `ReadOnlyNote` is the boxed
 * variant for whole forms.
 */
export function ReadOnlyLine({ children, size = "sm", id }: ReadOnlyLineProps) {
  return (
    <p
      id={id}
      className={cn(
        "flex items-center gap-2 font-medium text-muted-foreground",
        size === "md" ? "text-sm" : "text-xs",
      )}
    >
      <Lock
        aria-hidden
        className={cn("shrink-0", size === "md" ? "size-4" : "size-3.5")}
        strokeWidth={2}
      />
      {children}
    </p>
  );
}
