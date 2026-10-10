import { Badge } from "@/components/ui/badge";
import type { InsightSeverity } from "@/lib/api";

import { SEVERITY_LABELS } from "./insight-format";
import { SEVERITY_STYLE } from "./severity-style";

/**
 * Figma "Doctor/Severity badge": a pill with a differently shaped icon and the severity spelled
 * out, so it never reads by colour alone. Info sits on the neutral tokens.
 */
export function SeverityBadge({ severity }: { severity: InsightSeverity }) {
  const { variant, icon: Icon } = SEVERITY_STYLE[severity];
  return (
    <Badge variant={variant} className="border border-current/30">
      <Icon aria-hidden strokeWidth={2} />
      {SEVERITY_LABELS[severity]}
    </Badge>
  );
}
