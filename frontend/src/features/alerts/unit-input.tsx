import type { ComponentProps } from "react";

import { inputClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface UnitInputProps extends ComponentProps<"input"> {
  /** Before the number, e.g. "$". */
  prefix?: string | undefined;
  /** After the number, e.g. "%", "s", "min". */
  suffix?: string | undefined;
}

/**
 * Figma "Alerts/Field" with its unit inside the box: a number field whose prefix or suffix is
 * part of the visual field but not of the value. The unit is hidden from screen readers; the
 * label names it instead where it matters.
 */
export function UnitInput({ prefix, suffix, className, ...props }: UnitInputProps) {
  return (
    <div className="relative">
      {prefix ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-subtle-foreground"
        >
          {prefix}
        </span>
      ) : null}
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn(inputClasses, "tabular", prefix && "pl-8", suffix && "pr-16", className)}
        {...props}
      />
      {suffix ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-subtle-foreground"
        >
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
