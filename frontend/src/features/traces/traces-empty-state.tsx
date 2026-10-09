import { Link } from "@tanstack/react-router";
import { FilterX, Radio } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useProjectFilters, useProjectParams } from "@/features/shell/project-context";
import { describeRange } from "@/lib/time-range";

interface TracesEmptyStateProps {
  hasFacetFilters: boolean;
  onClearFilters: () => void;
}

/** What the list shows when nothing matches: a filtered-out list, or a window with no traces. */
export function TracesEmptyState({ hasFacetFilters, onClearFilters }: TracesEmptyStateProps) {
  const { orgId, projectId } = useProjectParams();
  const { range, environment } = useProjectFilters();
  const period = describeRange(range).toLowerCase();

  if (hasFacetFilters) {
    return (
      <EmptyState
        icon={FilterX}
        title="No traces match these filters"
        description={`Nothing in the ${period} matches every filter. Remove a filter or widen the time range.`}
        action={
          <Button size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={Radio}
      title="No traces in this range"
      description={
        environment
          ? `No traces from the "${environment}" environment in the ${period}. Pick a wider time range or another environment.`
          : `No traces were received in the ${period}. Pick a wider time range, or connect your app to start sending traces.`
      }
      action={
        <Button asChild size="sm" variant="primary">
          <Link to="/onboarding" search={{ org: orgId, project: projectId }}>
            Connect your app
          </Link>
        </Button>
      }
    />
  );
}
