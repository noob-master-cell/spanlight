import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type NoticeTone = "info" | "success" | "warning" | "danger";

interface NoticeProps {
  /** `info` is the muted note tile (Figma invite "Note"); the others tint by status. */
  tone?: NoticeTone;
  /** Overrides the tone's default icon. */
  icon?: LucideIcon;
  /** Use "alert" for errors that appear after an action so screen readers announce them. */
  role?: "alert" | "status";
  children: ReactNode;
  className?: string;
}

const TONES: Record<NoticeTone, { classes: string; icon: LucideIcon; iconClass: string }> = {
  info: { classes: "bg-surface-muted text-muted-foreground", icon: Info, iconClass: "" },
  success: { classes: "bg-success-subtle text-success", icon: CircleCheck, iconClass: "" },
  warning: { classes: "bg-warning-subtle text-warning", icon: TriangleAlert, iconClass: "" },
  danger: {
    classes: "bg-danger-subtle text-danger-text",
    icon: CircleAlert,
    iconClass: "text-danger",
  },
};

/** A tinted tile with an icon and a short message: notes, inline errors, warnings. */
export function Notice({ tone = "info", icon, role, children, className }: NoticeProps) {
  const toneStyle = TONES[tone];
  const Icon = icon ?? toneStyle.icon;
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-3 rounded-tile px-4 py-3.5 text-xs leading-[1.4] font-medium",
        toneStyle.classes,
        className,
      )}
    >
      <Icon aria-hidden className={cn("size-4 shrink-0", toneStyle.iconClass)} strokeWidth={2} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
