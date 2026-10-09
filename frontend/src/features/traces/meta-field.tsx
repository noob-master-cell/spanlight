import type { ReactNode } from "react";

import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

interface MetaFieldProps {
  label: string;
  children: ReactNode;
  /** `stacked`: label over value, for compact grids. `inline`: a 140px label column. */
  layout: "stacked" | "inline";
  /** Render the value in JetBrains Mono (IDs, model names, versions). */
  mono?: boolean;
  /** Adds a copy button after the value. */
  copyValue?: string;
  copyLabel?: string;
}

/** Figma "Traces/Meta field": one key/value pair inside a `<dl>`. */
export function MetaField({
  label,
  children,
  layout,
  mono = false,
  copyValue,
  copyLabel,
}: MetaFieldProps) {
  const stacked = layout === "stacked";
  return (
    <div
      className={cn("flex min-w-0", stacked ? "flex-col gap-0.5" : "min-h-8 items-center gap-3")}
    >
      <dt
        className={cn(
          "truncate text-muted-foreground",
          stacked ? "text-xs font-medium" : "w-28 shrink-0 text-sm sm:w-35",
        )}
      >
        {label}
      </dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1">
        <span
          className={cn(
            "min-w-0 truncate text-foreground",
            mono ? "font-mono text-label" : "text-sm",
            !mono && stacked && "font-medium",
          )}
        >
          {children}
        </span>
        {copyValue !== undefined ? (
          <CopyButton
            value={copyValue}
            label={copyLabel ?? `Copy ${label.toLowerCase()}`}
            className="ml-auto size-7 shrink-0"
          />
        ) : null}
      </dd>
    </div>
  );
}
