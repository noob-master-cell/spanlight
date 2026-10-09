import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type StatusTone = "accent" | "success" | "danger";

const TONES: Record<StatusTone, string> = {
  accent: "bg-accent-subtle text-accent",
  success: "bg-success-subtle text-success",
  danger: "bg-danger-subtle text-danger",
};

interface AuthStatusTileProps {
  icon: LucideIcon;
  tone: StatusTone;
  /** Turns the icon, for a spinner while something is being checked. */
  spinning?: boolean;
}

/** The rounded square above a headline that says what kind of moment this is (Figma "Status icon"). */
export function AuthStatusTile({ icon: Icon, tone, spinning = false }: AuthStatusTileProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[52px] shrink-0 items-center justify-center rounded-tile sm:size-14",
        TONES[tone],
      )}
    >
      <Icon className={cn("size-6 sm:size-[26px]", spinning && "animate-spin")} strokeWidth={2} />
    </span>
  );
}
