import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type CalloutTone = "info" | "success" | "warning" | "danger";

interface CalloutProps {
  tone?: CalloutTone;
  /** A semibold first line, e.g. "Not available on this server". */
  title?: ReactNode;
  /** A row action (a small button) under the text. */
  action?: ReactNode;
  /**
   * `alert` for an error that appears after a person acted; `status` for a polite confirmation or
   * note. Leave unset for content that is on the page from the start.
   */
  role?: "alert" | "status";
  children: ReactNode;
}

const TONES: Record<CalloutTone, { icon: LucideIcon; classes: string }> = {
  info: { icon: Info, classes: "bg-surface-muted text-muted-foreground" },
  success: { icon: CircleCheck, classes: "bg-success-subtle text-success" },
  warning: { icon: TriangleAlert, classes: "bg-warning-subtle text-warning" },
  danger: { icon: CircleAlert, classes: "bg-danger-subtle text-danger-text" },
};

/**
 * A tinted message with a status icon, an optional title and an optional action (Figma
 * "Callout"). It carries its meaning in the icon and the words, never in colour alone, and the
 * text colours reach 4.5:1 on their tints.
 */
export function Callout({ tone = "info", title, action, role, children }: CalloutProps) {
  const { icon: Icon, classes } = TONES[tone];
  return (
    <div role={role} className={cn("flex items-start gap-2.5 rounded-input px-3.5 py-3", classes)}>
      <span className="flex h-[21px] w-4 shrink-0 items-center justify-center">
        <Icon aria-hidden className="size-4" strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm [overflow-wrap:anywhere]">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className="font-medium">{children}</div>
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}
