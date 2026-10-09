import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

interface RequireTwoFactorTileProps {
  /** The switch's id, so the title labels it. Left out when there is no switch to label. */
  labelFor?: string;
  /** Names the description for the switch's `aria-describedby`. */
  descriptionId: string;
  description: string;
  /** The switch for an owner, a status badge for everyone else. */
  children: ReactNode;
}

/** The "Require two-factor authentication" tile (Figma "Setting / Require 2FA"). */
export function RequireTwoFactorTile({
  labelFor,
  descriptionId,
  description,
  children,
}: RequireTwoFactorTileProps) {
  const title = "Require two-factor authentication";

  return (
    <div className="flex items-center gap-4 rounded-tile bg-surface-muted p-4">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-input bg-surface text-accent"
      >
        <ShieldCheck className="size-5" strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
        {labelFor ? (
          <Label htmlFor={labelFor} className="text-sm">
            {title}
          </Label>
        ) : (
          <p className="font-semibold text-foreground">{title}</p>
        )}
        <p id={descriptionId} className="text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}
