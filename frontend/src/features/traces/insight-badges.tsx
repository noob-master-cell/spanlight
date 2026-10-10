import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { badgeVariants } from "@/components/ui/badge";
import {
  type InsightQuery,
  SEVERITY_LABELS,
  SEVERITY_STYLE,
  useProjectInsights,
} from "@/features/doctor";
import { useProjectParams } from "@/features/shell/project-context";
import type { Insight } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Findings that still need a person; resolved and muted ones are not a reason to look. */
const ACTIVE_STATUSES = ["open", "acknowledged"] as const;
/** The API cites at most 20 traces per insight; a trace rarely carries more than a few. */
const BADGE_LIMIT = 10;

/** The trace's open Doctor findings; empty while loading and on error (a badge is a hint). */
function useTraceInsights(traceId: string): Insight[] {
  const query: InsightQuery = {
    trace_id: traceId,
    status: ACTIVE_STATUSES,
    limit: BADGE_LIMIT,
  };
  return useProjectInsights(query, { retry: false }).data?.items ?? [];
}

/**
 * Figma "Doctor/Insight badge": "Critical · Retry storm ›", one chip per insight. The chip is its
 * own shape (a link with a chevron); the severity icon and wording are the Doctor's, so severity
 * never reads by colour alone.
 */
export function InsightBadges({ traceId }: { traceId: string }) {
  const { orgId, projectId } = useProjectParams();
  const insights = useTraceInsights(traceId);
  if (insights.length === 0) {
    return null;
  }
  return (
    <ul aria-label="Doctor findings for this trace" className="flex flex-wrap items-center gap-2">
      {insights.map((insight) => {
        const { variant, icon: Icon } = SEVERITY_STYLE[insight.severity];
        return (
          <li key={insight.id} className="min-w-0">
            <Link
              to="/$orgId/$projectId/doctor/$insightId"
              params={{ orgId, projectId, insightId: insight.id }}
              title={insight.title}
              className={cn(
                badgeVariants({ variant }),
                "max-w-full border border-current/25 hover:underline",
              )}
            >
              <Icon aria-hidden strokeWidth={2} />
              <span className="truncate">
                {SEVERITY_LABELS[insight.severity]} · {insight.label}
              </span>
              <ChevronRight aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
