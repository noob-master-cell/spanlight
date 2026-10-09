import { useId, type ReactNode } from "react";

import { Card } from "@/components/ui/card";

interface DangerZoneCardProps {
  /** What the action is called, e.g. "Delete project". */
  label: string;
  /** What it does, in the approved wording. */
  explanation: string;
  /** The button that opens the confirmation. */
  children: ReactNode;
}

/**
 * The "Danger zone" card (Figma "Settings/Danger zone"): a rose border, the action's name and what
 * it does on the left, its button on the right. The button opens a typed-slug confirmation.
 */
export function DangerZoneCard({ label, explanation, children }: DangerZoneCardProps) {
  const titleId = useId();

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      className="flex flex-col gap-5 border-danger p-5 sm:p-6"
    >
      <h2 id={titleId} className="text-card text-danger-text">
        Danger zone
      </h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <p className="font-semibold text-foreground">{label}</p>
          <p className="text-muted-foreground">{explanation}</p>
        </div>
        <div className="flex shrink-0 sm:justify-end">{children}</div>
      </div>
    </Card>
  );
}
