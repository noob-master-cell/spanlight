import { useId, type ReactNode } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title: string;
  description?: ReactNode;
  /** Controls aligned with the title, e.g. a "Create key" button or a count badge. */
  actions?: ReactNode;
  children?: ReactNode;
  /** The gap between the header and the content differs per card in the design. */
  className?: string;
}

/** One settings card: title and description, optional actions, then the content. */
export function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
}: SettingsSectionProps) {
  const titleId = useId();

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      className={cn("flex flex-col gap-5 p-5 sm:p-6", className)}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <CardTitle id={titleId}>{title}</CardTitle>
          {description ? (
            <div className="text-xs font-medium text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </Card>
  );
}
