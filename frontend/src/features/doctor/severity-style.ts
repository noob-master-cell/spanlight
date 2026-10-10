import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";

import type { InsightSeverity } from "@/lib/api";

/** Badge variant and icon per severity; the icon shape tells severities apart without colour. */
export const SEVERITY_STYLE: Record<
  InsightSeverity,
  { variant: "danger" | "warning" | "neutral"; icon: LucideIcon }
> = {
  critical: { variant: "danger", icon: TriangleAlert },
  warning: { variant: "warning", icon: CircleAlert },
  info: { variant: "neutral", icon: Info },
};
