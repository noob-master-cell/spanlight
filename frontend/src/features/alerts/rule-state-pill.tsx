import { BellOff, TriangleAlert, UserCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { NO_DATA_REASON, type RulePill, type RulePillTone } from "./rule-state";

const PILL_BASE =
  "inline-flex h-[26px] shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs leading-[1.4] font-semibold whitespace-nowrap";

const TONE_CLASSES: Record<RulePillTone, string> = {
  firing: "border border-danger bg-danger-subtle text-danger-text",
  ok: "bg-success-subtle text-success",
  muted: "bg-warning-subtle text-warning",
  disabled: "border border-border-strong bg-surface text-muted-foreground",
  nodata: "border border-dashed border-border-strong bg-surface text-muted-foreground",
};

function PillMark({ tone }: { tone: RulePillTone }) {
  if (tone === "muted") {
    return <BellOff aria-hidden className="size-3" strokeWidth={2} />;
  }
  if (tone === "disabled" || tone === "nodata") {
    return <span aria-hidden className="size-2 rounded-full border-[1.5px] border-current" />;
  }
  return (
    <span
      aria-hidden
      className={cn("size-2 rounded-full", tone === "firing" ? "bg-danger" : "bg-success")}
    />
  );
}

/**
 * Figma "Alerts/State pill": Firing, OK, Muted until …, Disabled, No data yet. The text carries
 * the state; "No data yet" is focusable and explains itself in a tooltip.
 */
export function RuleStatePill({ pill }: { pill: RulePill }) {
  const content = (
    <span className={cn(PILL_BASE, TONE_CLASSES[pill.tone])}>
      <PillMark tone={pill.tone} />
      {pill.label}
      {pill.tone === "nodata" ? <span className="sr-only">: {NO_DATA_REASON}</span> : null}
    </span>
  );
  if (pill.tone !== "nodata") {
    return content;
  }
  return (
    <Tooltip content={NO_DATA_REASON}>
      <span tabIndex={0} className="relative z-10 inline-flex cursor-help rounded-full">
        {content}
      </span>
    </Tooltip>
  );
}

const BADGE_BASE =
  "inline-flex shrink-0 items-center gap-1 rounded-full py-[3px] pr-[9px] pl-[7px] text-xs leading-[1.4] font-semibold whitespace-nowrap";

function RowBadge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn(BADGE_BASE, className)}>{children}</span>;
}

/** Figma "Alerts/Row badge · stillfiring": a muted rule that is breaching. */
export function StillFiringBadge() {
  return (
    <RowBadge className="bg-danger-subtle text-danger-text">
      <TriangleAlert aria-hidden className="size-3" strokeWidth={2} />
      Still firing
    </RowBadge>
  );
}

/** Figma "Alerts/Row badge · ack": someone acknowledged the open event. */
export function AcknowledgedBadge() {
  return (
    <RowBadge className="bg-accent-subtle text-accent">
      <UserCheck aria-hidden className="size-3" strokeWidth={2} />
      Acknowledged
    </RowBadge>
  );
}
