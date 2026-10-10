import { BellOff, CircleCheck, UserCheck, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { InsightStatus } from "@/lib/api";

import { STATUS_LABELS } from "./insight-format";

const STATUS_ICONS: Record<InsightStatus, LucideIcon | null> = {
  open: null,
  acknowledged: UserCheck,
  muted: BellOff,
  resolved: CircleCheck,
};

/** Figma "Doctor/Status pill": a dot for open, an icon for the other statuses, and the word. */
export function StatusPill({ status }: { status: InsightStatus }) {
  const Icon = STATUS_ICONS[status];
  return (
    <Badge variant="outline" className="border-border-strong">
      {Icon === null ? (
        <span aria-hidden className="size-2 rounded-full bg-foreground" />
      ) : (
        <Icon aria-hidden strokeWidth={2} />
      )}
      {STATUS_LABELS[status]}
    </Badge>
  );
}
