import { ErrorState } from "@/components/error-state";
import { ColumnLabels, TileList, TileListSkeleton } from "@/components/tile-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { LabRunRow, RUN_GRID } from "./lab-run-row";
import { useLabRunsQuery } from "./lab-queries";

/**
 * Figma "Recent lab runs": the newest calls a fault changed, read from the traces API by their
 * `lab:<scenario>` tag. Loading, error and empty each fill the same card.
 */
export function LabRuns() {
  const { runs, isPending, error, refetch } = useLabRunsQuery();

  return (
    <Card role="region" aria-labelledby="lab-runs-title">
      <CardHeader>
        <div>
          <CardTitle id="lab-runs-title">Recent lab runs</CardTitle>
          <CardDescription>
            Calls a fault profile changed in the last 7 days, newest first. Each one links to its
            trace.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <TileListSkeleton label="Loading lab runs" rows={3} />
        ) : error ? (
          <ErrorState compact error={error} title="Couldn't load lab runs" onRetry={refetch} />
        ) : runs.length === 0 ? (
          <p className="rounded-tile bg-surface-muted px-4 py-8 text-center text-sm text-muted-foreground">
            No faulted calls yet.
          </p>
        ) : (
          <div className="@container flex flex-col gap-3">
            <ColumnLabels className={cn("gap-3 pr-3 pl-4 @[44rem]:grid", RUN_GRID)}>
              <span>Time</span>
              <span>Call</span>
              <span>Scenario</span>
              <span>Result</span>
              <span />
            </ColumnLabels>
            <TileList label="Recent lab runs">
              {runs.map((run) => (
                <LabRunRow key={run.trace.trace_id} run={run} />
              ))}
            </TileList>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
