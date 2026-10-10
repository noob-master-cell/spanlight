import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { ColumnLabels, TileList } from "@/components/tile-list";
import { Skeleton } from "@/components/ui/skeleton";
import type { Insight } from "@/lib/api";

import { InsightRow } from "./insight-row";

interface InsightListProps {
  items: readonly Insight[];
  now: Date;
  /** The "Load more" footer, when there is more. */
  footer?: ReactNode;
}

/** Figma "Doctor — Insights list": the rows under their column labels. */
export function InsightList({ items, now, footer }: InsightListProps) {
  return (
    <div className="@container flex flex-col gap-3">
      <ColumnLabels className="gap-5 pr-5 pl-5 @[44rem]:flex">
        <span className="w-[110px] shrink-0">Severity</span>
        <span className="min-w-0 flex-1">Insight</span>
        <span className="w-[250px] shrink-0">Activity</span>
        <span className="w-4 shrink-0" />
      </ColumnLabels>
      <TileList label="Insights">
        {items.map((insight) => (
          <InsightRow key={insight.id} insight={insight} now={now} />
        ))}
      </TileList>
      {footer}
      <p className="flex items-center gap-2 px-1 pt-1.5 text-xs font-medium text-muted-foreground">
        <Info aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
        Most recently seen first. A finding resolves on its own after 24 hours without a recurrence.
      </p>
    </div>
  );
}

/** Figma "Doctor — Insights list — loading": tiles shaped like insight rows. */
export function InsightListSkeleton() {
  return (
    <div role="status" aria-label="Loading insights" className="flex flex-col gap-1.5">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-[82px] rounded-tile" />
      ))}
    </div>
  );
}
