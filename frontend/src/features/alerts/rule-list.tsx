import { Info } from "lucide-react";

import { TileList } from "@/components/tile-list";
import { Skeleton } from "@/components/ui/skeleton";
import type { AlertChannel, AlertRule } from "@/lib/api";

import { sortRules } from "./rule-state";
import { RuleColumnLabels, RuleRow } from "./rule-row";

interface RuleListProps {
  rules: readonly AlertRule[];
  channels: ReadonlyMap<string, AlertChannel> | undefined;
  /** Rules whose open event someone acknowledged. */
  acknowledged: ReadonlySet<string>;
  now: Date;
}

/** Figma "Alerts — Rules": the rule tiles under their column labels, firing rules first. */
export function RuleList({ rules, channels, acknowledged, now }: RuleListProps) {
  return (
    <div className="@container flex flex-col gap-3">
      <RuleColumnLabels />
      <TileList label="Alert rules">
        {sortRules(rules).map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            channels={channels}
            acknowledged={acknowledged.has(rule.id)}
            now={now}
          />
        ))}
      </TileList>
      <p className="flex items-center gap-2 px-1 pt-1.5 text-xs font-medium text-muted-foreground">
        <Info aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
        Firing rules show first. A muted rule keeps evaluating and recording events.
      </p>
    </div>
  );
}

/** Figma "Alerts — Rules — loading": tiles shaped like rule rows. */
export function RuleListSkeleton() {
  return (
    <div role="status" aria-label="Loading alert rules" className="flex flex-col gap-1.5">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-[62px] rounded-tile" />
      ))}
    </div>
  );
}
