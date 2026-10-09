import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectParams } from "@/features/shell";
import type { FaultScenarioCount } from "@/lib/api";
import { formatInteger } from "@/lib/format";

import { sortedFaults } from "./overview-format";

/** Lab faults of the window: one chip per scenario with its call count. */
export function FaultChips({ faults }: { faults: readonly FaultScenarioCount[] }) {
  return (
    <FaultsCard>
      {faults.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lab faults in this window.</p>
      ) : (
        <ul aria-label="Lab faults by scenario" className="flex flex-wrap gap-2">
          {sortedFaults(faults).map((fault) => (
            <li
              key={fault.scenario}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface pr-2 pl-3 shadow-card"
            >
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning" />
              <span className="font-mono text-xs text-foreground">{fault.scenario}</span>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-foreground tabular">
                {formatInteger(fault.count)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </FaultsCard>
  );
}

export function FaultChipsSkeleton() {
  return (
    <FaultsCard>
      <div aria-hidden className="flex flex-wrap gap-2">
        {[28, 36, 32, 30].map((width) => (
          <Skeleton key={width} className="h-9 rounded-full" style={{ width: `${width * 4}px` }} />
        ))}
      </div>
    </FaultsCard>
  );
}

function FaultsCard({ children }: { children: ReactNode }) {
  const { orgId, projectId } = useProjectParams();
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Lab faults</CardTitle>
          <CardDescription>
            Calls a fault profile changed in this window. Each one is tagged lab:&lt;scenario&gt; in
            Traces.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {children}
        <Link
          to="/$orgId/$projectId/gateway/lab"
          params={{ orgId, projectId }}
          className="inline-flex w-fit items-center gap-1 rounded-sm text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          Open Lab
          <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
