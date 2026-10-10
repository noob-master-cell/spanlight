import { Stethoscope } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import type { InsightStatus } from "@/lib/api";
import { useNow } from "@/lib/use-now";

import { useHasAnyInsight, useLastDetectorRun } from "./doctor-queries";
import { compactRelative, STATUS_LABELS } from "./insight-format";
import { InsightListSkeleton } from "./insight-list";

interface InsightEmptyProps {
  status: InsightStatus;
  /** A severity or kind filter is on. */
  filtered: boolean;
  onClearFilters: () => void;
  onViewResolved: () => void;
}

const OTHER_TAB_BODY: Record<Exclude<InsightStatus, "open">, string> = {
  acknowledged: "Insights someone has seen and is working on appear here.",
  muted: "Muted insights keep counting occurrences but never notify. They appear here.",
  resolved: "A finding resolves on its own after 24 hours without a recurrence.",
};

/** Figma "Doctor — empty" frames: no findings yet, filters that match nothing, nothing open. */
export function InsightEmpty(props: InsightEmptyProps) {
  const { status, filtered, onClearFilters } = props;
  if (filtered) {
    return (
      <Shell
        title="No insights match these filters."
        description="Try a different severity or kind, or clear the filters to see every insight in this tab."
        action={
          <Button size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }
  if (status === "open") {
    return <NothingOpen onViewResolved={props.onViewResolved} />;
  }
  return (
    <Shell
      title={`No ${STATUS_LABELS[status].toLowerCase()} insights`}
      description={OTHER_TAB_BODY[status]}
    />
  );
}

/** The Open tab with nothing in it: a fresh project, or one whose findings were all dealt with. */
function NothingOpen({ onViewResolved }: { onViewResolved: () => void }) {
  const history = useHasAnyInsight(true);
  const run = useLastDetectorRun();
  const now = useNow();
  if (history.isPending) {
    return <InsightListSkeleton />;
  }
  if (history.isError) {
    return (
      <Shell
        title="Nothing open."
        description="The Doctor checks every 15 minutes. Earlier findings are in the other tabs."
      />
    );
  }
  if (!history.data) {
    return (
      <Shell
        title="No findings yet — the Doctor checks every 15 minutes."
        description="When a check finds something, it appears here with the evidence, where it fails and a suggested fix."
      />
    );
  }
  const checked = compactRelative(run.data?.ran_at ?? null, now);
  return (
    <Shell
      title="Nothing open."
      description={
        checked === null
          ? "The Doctor checks every 15 minutes. Earlier findings are in the other tabs."
          : `The Doctor last checked ${checked}. Earlier findings are in the other tabs.`
      }
      action={
        <Button size="sm" onClick={onViewResolved}>
          View resolved
        </Button>
      }
    />
  );
}

function Shell({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      icon={Stethoscope}
      title={title}
      description={description}
      action={action}
      className="rounded-tile bg-surface-muted"
    />
  );
}
