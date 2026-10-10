import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { useProjectParams } from "@/features/shell";
import { shortId } from "@/lib/format";

/** Traces shown before "Show all": one row of chips. */
export const COLLAPSED_TRACES = 5;

interface EvidenceTraceLinksProps {
  /** At most 20, newest first. */
  traceIds: readonly string[];
}

/**
 * Figma "Example traces": the first five as mono chips that open the trace, "5 of 20 shown ·
 * newest first", and a "Show all 20 traces" control that expands the rest.
 */
export function EvidenceTraceLinks({ traceIds }: EvidenceTraceLinksProps) {
  const { orgId, projectId } = useProjectParams();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const total = traceIds.length;
  const shown = expanded ? traceIds : traceIds.slice(0, COLLAPSED_TRACES);

  if (total === 0) {
    return (
      <p className="text-sm text-rail-muted-foreground">
        No example traces were recorded for this finding.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-overline text-rail-subtle-foreground uppercase">Example traces</h3>
        <p className="text-xs text-rail-muted-foreground tabular">
          {shown.length} of {total} shown · newest first
        </p>
      </div>
      <ul id={listId} aria-label="Example traces" className="flex flex-wrap gap-2">
        {shown.map((traceId) => (
          <li key={traceId}>
            <Link
              to="/$orgId/$projectId/traces/$traceId"
              params={{ orgId, projectId, traceId }}
              aria-label={`Open trace ${traceId}`}
              className="inline-flex min-h-8 items-center rounded-full bg-rail-tile px-3 font-mono text-xs text-rail-foreground transition-colors hover:bg-rail-tile-hover focus-visible:outline-lime"
            >
              {shortId(traceId, 16)}
            </Link>
          </li>
        ))}
      </ul>
      {total > COLLAPSED_TRACES ? (
        <Button
          size="sm"
          aria-expanded={expanded}
          aria-controls={listId}
          className="w-fit bg-rail-tile text-rail-foreground shadow-none hover:bg-rail-tile-hover focus-visible:outline-lime"
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          {expanded ? `Show fewer traces` : `Show all ${String(total)} traces`}
          {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
        </Button>
      ) : null}
    </div>
  );
}
