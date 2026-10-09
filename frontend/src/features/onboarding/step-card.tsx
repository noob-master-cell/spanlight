import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

interface StepCardProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  children: ReactNode;
}

/**
 * The white card that holds one setup form (Figma "Step card"): a violet icon tile, an H2
 * title with a short description, then the form.
 */
export function StepCard({ icon: Icon, title, description, children }: StepCardProps) {
  return (
    <Card className="flex flex-col gap-7 p-6 sm:p-10">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-input bg-accent-subtle text-accent"
        >
          <Icon className="size-[22px]" strokeWidth={2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="text-h2 text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}
