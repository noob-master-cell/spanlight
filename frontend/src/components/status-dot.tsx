import { cn } from "@/lib/utils";

type StatusDotState = "ok" | "error" | "warning" | "unset" | "live";

interface StatusDotProps {
  /** `ok` success green, `error` rose, `warning` amber, `unset` grey, `live` lime with a pulse. */
  state: StatusDotState;
  /**
   * Screen-reader text, e.g. "Succeeded". Omit when the dot sits next to visible text that
   * already says the same thing: it is then hidden from assistive technology.
   */
  label?: string;
  /** Pulse ring (disabled under reduced motion). On by default for `live`. */
  pulse?: boolean;
  className?: string;
}

const STATE_CLASSES: Record<StatusDotState, string> = {
  ok: "bg-success text-success",
  error: "bg-danger text-danger",
  warning: "bg-warning text-warning",
  unset: "bg-subtle-foreground text-subtle-foreground",
  live: "bg-lime text-lime",
};

/** An 8px status dot (Figma "Status dot"). Colour is never the only signal: pair with text. */
export function StatusDot({ state, label, pulse, className }: StatusDotProps) {
  const pulsing = pulse ?? state === "live";
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        STATE_CLASSES[state],
        pulsing && "animate-live-pulse",
        className,
      )}
    />
  );
}

export type { StatusDotState };
