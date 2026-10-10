import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { TraceSummary } from "@/lib/api";
import { pluralize } from "@/lib/format";

import { turnRangeLabel } from "./session-format";
import { SessionTurn } from "./session-turn";

/**
 * Turns shown at first and per "Show more". Each turn loads its own trace for the message
 * text, so revealing them in batches keeps a long session from firing a request per turn.
 */
const TURN_BATCH_SIZE = 10;

interface SessionConversationProps {
  /** Loaded turns, oldest first. */
  traces: TraceSummary[];
  /** Older turns exist that aren't loaded yet. */
  hasEarlierTurns: boolean;
  isLoadingEarlier: boolean;
  loadEarlierFailed: boolean;
  onLoadEarlier: () => void;
}

/** The centred conversation column: one turn group per trace, oldest first. */
export function SessionConversation({
  traces,
  hasEarlierTurns,
  isLoadingEarlier,
  loadEarlierFailed,
  onLoadEarlier,
}: SessionConversationProps) {
  const titleId = useId();
  const [visibleCount, setVisibleCount] = useState(TURN_BATCH_SIZE);
  const visible = traces.slice(0, visibleCount);
  const remaining = traces.length - visible.length;
  const nextBatch = Math.min(remaining, TURN_BATCH_SIZE);

  return (
    <Card role="region" aria-labelledby={titleId} className="flex flex-col gap-7 p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitle id={titleId}>Conversation</CardTitle>
          <CardDescription className="mt-0 font-medium">
            One turn per trace, oldest first
          </CardDescription>
        </div>
        <Badge className="shrink-0 tabular">
          {turnRangeLabel(visible.length, traces.length, hasEarlierTurns)}
        </Badge>
      </div>

      {hasEarlierTurns ? (
        <div className="flex flex-col gap-3 rounded-tile border border-dashed border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            Older turns in this session aren&apos;t loaded yet, so turns aren&apos;t numbered.
          </p>
          <Button size="sm" loading={isLoadingEarlier} onClick={onLoadEarlier}>
            {loadEarlierFailed ? "Retry loading earlier turns" : "Load earlier turns"}
          </Button>
        </div>
      ) : null}

      <ol className="flex flex-col gap-7">
        {visible.map((trace, index) => (
          <li key={trace.trace_id}>
            <SessionTurn trace={trace} turnNumber={hasEarlierTurns ? null : index + 1} />
          </li>
        ))}
      </ol>

      {nextBatch > 0 ? (
        <div className="flex justify-center">
          <Button
            onClick={() => {
              setVisibleCount((current) => current + TURN_BATCH_SIZE);
            }}
          >
            Show {pluralize(nextBatch, "more turn", "more turns")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
