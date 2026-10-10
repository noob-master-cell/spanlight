import type { ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** `on-ink` is for the dark header bands (trace, user): light-on-dark placeholder colours. */
export type UnknownTone = "default" | "on-ink";

const TONE_CLASSES: Record<UnknownTone, string> = {
  default: "text-subtle-foreground decoration-border",
  "on-ink": "text-rail-muted-foreground decoration-rail-subtle-foreground",
};

interface UnknownValueProps {
  /** Why the value is missing, e.g. "No price for this model". */
  reason: string;
  tone?: UnknownTone;
  className?: string;
}

/** The shared placeholder for unknown metrics: an em dash with an explanation. */
export function UnknownValue({ reason, tone = "default", className }: UnknownValueProps) {
  return (
    <Tooltip content={reason}>
      <span
        tabIndex={0}
        aria-label={`Unknown: ${reason}`}
        className={cn(
          "cursor-help rounded-sm underline decoration-dotted underline-offset-4",
          TONE_CLASSES[tone],
          className,
        )}
      >
        —
      </span>
    </Tooltip>
  );
}

interface ValueOrUnknownProps {
  value: ReactNode | null;
  reason: string;
  className?: string;
}

/** Renders `value`, or the unknown placeholder when the value is null. */
export function ValueOrUnknown({ value, reason, className }: ValueOrUnknownProps) {
  if (value === null || value === undefined || value === "") {
    return <UnknownValue reason={reason} className={className} />;
  }
  return <span className={className}>{value}</span>;
}
