import { Check, TriangleAlert, UserCheck, type LucideIcon } from "lucide-react";

import { UnknownValue } from "@/components/unknown-value";
import type { AlertRule } from "@/lib/api";
import { cn } from "@/lib/utils";

import { clockLabel, compactRelative } from "./alert-time";
import { COMPARATOR_SYMBOLS, formatMetricValue } from "./metric-labels";
import { TimeText } from "./time-text";
import {
  personName,
  resolvedAfter,
  type MarkerKind,
  type TimelineMarker,
} from "./timeline-markers";

type RuleView = Pick<AlertRule, "metric" | "comparator">;

const MARKERS: Record<MarkerKind, { icon: LucideIcon; classes: string }> = {
  fired: { icon: TriangleAlert, classes: "bg-danger-subtle text-danger" },
  resolved: { icon: Check, classes: "bg-success-subtle text-success" },
  acknowledged: { icon: UserCheck, classes: "bg-accent-subtle text-accent" },
};

interface EventItemProps {
  marker: TimelineMarker;
  /** The rule's metric and comparator, to write the values in its unit. */
  rule: RuleView;
  /** The last item has no connector line under its marker. */
  last: boolean;
  now: Date;
}

/**
 * Figma "Alerts/Event item": a round marker on the timeline's line, what happened ("Fired",
 * "Resolved", "Acknowledged by …") with its numbers in mono, and when: relative, then the 24-hour
 * clock, with the exact time in a tooltip.
 */
export function EventItem({ marker, rule, last, now }: EventItemProps) {
  const { icon: Icon, classes } = MARKERS[marker.kind];
  const relative = compactRelative(marker.at, now);
  const clock = clockLabel(marker.at, now);

  return (
    <li className="flex gap-3.5">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className={cn("flex size-8 items-center justify-center rounded-full", classes)}>
          <Icon aria-hidden className="size-4" strokeWidth={2} />
        </span>
        {last ? null : <span aria-hidden className="w-0.5 flex-1 bg-border" />}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-[3px] pt-[3px]",
          last ? "pb-1" : "pb-[22px]",
        )}
      >
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="text-sm font-semibold text-foreground">
            <Title marker={marker} />
          </span>
          <Detail marker={marker} rule={rule} />
        </p>
        <p className="text-xs leading-[1.4] font-medium text-subtle-foreground">
          <TimeText
            iso={marker.at}
            text={relative === null || clock === null ? null : `${relative} · ${clock}`}
          />
        </p>
      </div>
    </li>
  );
}

function Title({ marker }: { marker: TimelineMarker }) {
  if (marker.kind === "fired") {
    return <>Fired</>;
  }
  if (marker.kind === "resolved") {
    return <>Resolved</>;
  }
  const by = marker.event.acknowledged_by;
  return <>Acknowledged by {by ? personName(by) : "a removed account"}</>;
}

/** "6.8 % > 5 %" when it fired (value against the line), "after 38 min" when it resolved. */
function Detail({ marker, rule }: { marker: TimelineMarker; rule: RuleView }) {
  let text: string | null = null;
  if (marker.kind === "fired") {
    const value = formatMetricValue(rule.metric, marker.event.value);
    if (value === null) {
      return (
        <span className="font-mono text-label">
          <UnknownValue reason="The value at firing wasn't recorded." />
        </span>
      );
    }
    const line = formatMetricValue(rule.metric, marker.event.threshold);
    text = line === null ? value : `${value} ${COMPARATOR_SYMBOLS[rule.comparator]} ${line}`;
  } else if (marker.kind === "resolved") {
    text = resolvedAfter(marker.event);
  }
  return text === null ? null : (
    <span className="font-mono text-label text-muted-foreground">{text}</span>
  );
}
