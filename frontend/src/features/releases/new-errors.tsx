import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { SectionCard } from "@/components/section-card";
import { useProjectParams } from "@/features/shell";
import type { NewError } from "@/lib/api";
import { formatInteger, shortId } from "@/lib/format";

interface NewErrorsProps {
  errors: readonly NewError[];
  /** Release names for the description. */
  a: string;
  b: string;
}

/** Figma "Top new errors in B": messages B has and A does not, each with an example trace. */
export function NewErrors({ errors, a, b }: NewErrorsProps) {
  return (
    <SectionCard
      title={`Top new errors in ${b}`}
      description={
        <>
          Error messages that appear in <Name>{b}</Name> and not in <Name>{a}</Name>. Digits and ids
          are normalised.
        </>
      }
    >
      {errors.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No new error messages: every failure in <Name>{b}</Name> also happened in <Name>{a}</Name>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {errors.map((error) => (
            <NewErrorRow key={error.message} error={error} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const LABEL_LENGTH = 12;

/** The trace id as the link text; the ellipsis only when something was cut off. */
function traceLabel(traceId: string): string {
  return traceId.length > LABEL_LENGTH ? `${shortId(traceId, LABEL_LENGTH)}…` : traceId;
}

/** Release names are free text: let a long one wrap instead of widening the card. */
function Name({ children }: { children: string }) {
  return <span className="[overflow-wrap:anywhere]">{children}</span>;
}

function NewErrorRow({ error }: { error: NewError }) {
  const { orgId, projectId } = useProjectParams();
  return (
    <li className="flex flex-col gap-2 rounded-tile bg-surface-muted px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <p className="min-w-0 flex-1 font-mono text-xs leading-5 [overflow-wrap:anywhere] text-foreground">
        {error.message}
      </p>
      <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
        <p className="flex flex-col items-end leading-tight">
          <span className="text-sm font-bold tabular">{formatInteger(error.count)}</span>
          <span className="text-xs text-muted-foreground">
            {error.count === 1 ? "occurrence" : "occurrences"}
          </span>
        </p>
        <Link
          to="/$orgId/$projectId/traces/$traceId"
          params={{ orgId, projectId, traceId: error.example_trace_id }}
          title={error.example_trace_id}
          className="inline-flex min-h-6 items-center gap-0.5 rounded-sm font-mono text-xs text-accent hover:underline hover:underline-offset-4"
        >
          {traceLabel(error.example_trace_id)}
          <ChevronRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    </li>
  );
}
