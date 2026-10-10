import { Link } from "@tanstack/react-router";
import { ArrowLeft, User } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { CopyButton } from "@/components/copy-button";
import { CostValue } from "@/components/cost-value";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectParams } from "@/features/shell/project-context";
import type { TraceSummary } from "@/lib/api";
import { formatDuration, pluralize } from "@/lib/format";

import { formatSessionWindow } from "./session-format";
import { consistentUserId, type SessionTotals } from "./session-summary";

export function BackToSessionsLink() {
  const { orgId, projectId } = useProjectParams();
  return (
    <Link
      to="/$orgId/$projectId/sessions"
      params={{ orgId, projectId }}
      className="inline-flex w-fit items-center gap-1.5 rounded-xs text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-3.5" />
      Sessions
    </Link>
  );
}

interface SessionHeaderProps {
  sessionId: string;
  traces: TraceSummary[];
  totals: SessionTotals;
  /** Older turns exist that aren't loaded yet, so totals cover loaded turns only. */
  partial: boolean;
}

/** Back link, the title with the session ID chip, and a one-line summary. */
export function SessionHeader({ sessionId, traces, totals, partial }: SessionHeaderProps) {
  const userId = consistentUserId(traces);

  return (
    <header className="flex flex-col gap-3.5">
      <BackToSessionsLink />
      <div className="flex min-w-0 flex-wrap items-center gap-3.5">
        <h1 className="text-h1 text-foreground">Session</h1>
        <div className="flex max-w-full min-w-0 items-center gap-1 rounded-full border border-border bg-surface py-1 pr-1.5 pl-3.5">
          <code title={sessionId} className="min-w-0 truncate font-mono text-code text-foreground">
            {sessionId}
          </code>
          <CopyButton
            value={sessionId}
            label="Copy session ID"
            className="size-7 [&_svg]:size-3.5"
          />
        </div>
      </div>
      <SessionStatsLine userId={userId} totals={totals} partial={partial} />
    </header>
  );
}

interface SessionStatsLineProps {
  userId: string | null;
  totals: SessionTotals;
  partial: boolean;
}

/** "12 turns · $0.214 · 1 error · Today 09:12 → 09:41 · 29m 33s", led by the user chip. */
function SessionStatsLine({ userId, totals, partial }: SessionStatsLineProps) {
  const timeWindow =
    totals.firstAt !== null && totals.lastAt !== null
      ? formatSessionWindow(totals.firstAt, totals.lastAt)
      : null;
  const duration = formatDuration(totals.durationMs);
  const items: { key: string; node: ReactNode }[] = [
    {
      key: "turns",
      node: (
        <span className="font-medium text-foreground tabular">
          {pluralize(totals.turns, "turn")}
          {partial ? "+" : ""}
        </span>
      ),
    },
    {
      key: "cost",
      node: (
        <span className="font-medium text-foreground">
          <span className="sr-only">Total cost: </span>
          <CostValue
            cost={totals.costUsd}
            hasUnpriced={totals.costIsLowerBound}
            unknownReason="No price for the models used"
          />
        </span>
      ),
    },
    {
      key: "errors",
      node:
        totals.errors > 0 ? (
          <span className="font-medium text-danger-text tabular">
            {pluralize(totals.errors, "error")}
          </span>
        ) : (
          <span className="text-muted-foreground">No errors</span>
        ),
    },
  ];
  if (timeWindow !== null) {
    items.push({
      key: "window",
      node: <span className="text-muted-foreground">{timeWindow}</span>,
    });
  }
  if (duration !== null) {
    items.push({
      key: "duration",
      node: <span className="text-muted-foreground tabular">{duration}</span>,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-sm">
      {userId !== null ? <UserChip userId={userId} /> : null}
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {items.map((item, index) => (
          <Fragment key={item.key}>
            {index > 0 ? (
              <span aria-hidden className="text-subtle-foreground">
                ·
              </span>
            ) : null}
            {item.node}
          </Fragment>
        ))}
      </p>
    </div>
  );
}

function UserChip({ userId }: { userId: string }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-accent-subtle py-1 pr-2.5 pl-1">
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
      >
        <User className="size-3" strokeWidth={2.25} />
      </span>
      <span className="sr-only">User: </span>
      <span title={userId} className="min-w-0 truncate font-mono text-label text-accent">
        {userId}
      </span>
    </span>
  );
}

export function SessionHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-3.5" aria-hidden>
      <Skeleton className="h-5 w-20" />
      <div className="flex items-center gap-3.5">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-48 rounded-full" />
      </div>
      <Skeleton className="h-7 w-96 max-w-full rounded-full" />
    </div>
  );
}
