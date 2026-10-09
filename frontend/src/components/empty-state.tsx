import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  /** Usually one primary pill button, optionally a secondary one. */
  action?: ReactNode;
  className?: string;
}

/** Icon tile on a soft mesh blob, a bold title, a muted explanation and the next step. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-6 py-12 text-center",
        className,
      )}
    >
      <div aria-hidden className="relative flex size-24 items-center justify-center">
        <span className="absolute top-1 left-2 size-14 rounded-full bg-mesh-2 opacity-70 blur-xl" />
        <span className="absolute top-3 right-1 size-14 rounded-full bg-mesh-1 opacity-80 blur-xl" />
        <span className="absolute bottom-1 left-6 size-14 rounded-full bg-mesh-3 opacity-70 blur-xl" />
        <span className="relative flex size-16 items-center justify-center rounded-2xl border border-border bg-surface shadow-card">
          <Icon className="size-7 text-foreground" strokeWidth={1.75} />
        </span>
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="text-lg font-bold tracking-[-0.01em] text-foreground">{title}</h3>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      {action ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
