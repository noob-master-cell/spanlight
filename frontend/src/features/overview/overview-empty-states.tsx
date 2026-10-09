import { getRouteApi } from "@tanstack/react-router";
import { CalendarSearch } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ResolvedRange } from "@/lib/time-range";

const overviewRoute = getRouteApi("/_authed/$orgId/$projectId/overview");

interface EmptyRangeStateProps {
  range: ResolvedRange;
  environment: string | undefined;
}

/** The project has traces, just none in the selected window or environment. */
export function EmptyRangeState({ range, environment }: EmptyRangeStateProps) {
  const navigate = overviewRoute.useNavigate();
  const canWiden = range.value !== "30d";
  const scope = environment ? ` in the ${environment} environment` : "";
  const hasActions = canWiden || environment !== undefined;

  return (
    <Card>
      <EmptyState
        icon={CalendarSearch}
        title="No traces in this time range"
        description={`Nothing was recorded${scope} during this period. Widen the time range${
          environment ? " or clear the environment filter" : ""
        } to see earlier traffic.`}
        className="py-16"
        action={
          hasActions ? (
            <>
              {canWiden ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    void navigate({
                      search: (prev) => ({ ...prev, range: "30d", from: undefined, to: undefined }),
                    });
                  }}
                >
                  Show last 30 days
                </Button>
              ) : null}
              {environment ? (
                <Button
                  onClick={() => {
                    void navigate({ search: (prev) => ({ ...prev, env: undefined }) });
                  }}
                >
                  All environments
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />
    </Card>
  );
}
