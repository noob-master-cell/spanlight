import type { ReactNode } from "react";

import { UnknownValue } from "@/components/unknown-value";
import { Card } from "@/components/ui/card";
import type { AlertEvent, AlertRule } from "@/lib/api";

import { compactRelative, whenLabel } from "./alert-time";
import { COMPARATOR_SYMBOLS, formatMetricValue, isUpward } from "./metric-labels";
import { isStillFiring, rulePill } from "./rule-state";
import { RuleStatePill, StillFiringBadge } from "./rule-state-pill";
import { measuredLabel } from "./rule-summary";
import { TimeText } from "./time-text";
import { personName } from "./timeline-markers";

interface RuleStateHeroProps {
  rule: AlertRule;
  /** The rule's open event; undefined while the events load or when they failed. */
  openEvent: AlertEvent | null | undefined;
  now: Date;
}

/** The unknown "—" in the ink card's muted text colour. */
function HeroUnknown({ reason }: { reason: string }) {
  return (
    <UnknownValue
      reason={reason}
      className="text-rail-muted-foreground decoration-rail-subtle-foreground"
    />
  );
}

/**
 * Figma "State hero": the ink card with the state pill, the last measured value against the line
 * it is checked against, and three tiles: since when, the last evaluation, and the open event's
 * acknowledgement.
 */
export function RuleStateHero({ rule, openEvent, now }: RuleStateHeroProps) {
  const state = rule.state;
  const value = formatMetricValue(rule.metric, state?.last_value);

  return (
    <Card variant="hero" className="flex flex-col gap-[22px] p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex flex-wrap items-center gap-1.5">
          <RuleStatePill pill={rulePill(rule, now)} />
          {isStillFiring(rule, now) ? <StillFiringBadge /> : null}
        </span>
        <span className="text-sm font-medium text-rail-muted-foreground">
          {measuredLabel(rule)}
        </span>
      </div>
      <p className="flex flex-wrap items-end gap-x-3.5 gap-y-1">
        <span className="text-[2.75rem] leading-none font-extrabold tracking-[-0.04em] text-hero-card-foreground tabular sm:text-metric-xl">
          {value ?? (
            <HeroUnknown
              reason={
                state === null
                  ? "This rule hasn't been evaluated yet."
                  : "The metric had no data in the last window."
              }
            />
          )}
        </span>
        <Versus rule={rule} openEvent={openEvent} />
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <SinceTile rule={rule} now={now} />
        <HeroTile label="Last evaluated">
          <TimeText
            iso={state?.last_evaluated_at}
            text={compactRelative(state?.last_evaluated_at, now)}
            fallback="Not yet"
          />
        </HeroTile>
        <EventTile firing={state?.state === "firing"} openEvent={openEvent} now={now} />
      </div>
    </Card>
  );
}

/** "vs > 5 % threshold"; for an anomaly rule the open event's line, "vs $12.30 upper limit". */
function Versus({ rule, openEvent }: Omit<RuleStateHeroProps, "now">) {
  let text: string | null = null;
  if (rule.kind === "threshold") {
    const threshold = formatMetricValue(rule.metric, rule.threshold);
    text =
      threshold === null
        ? null
        : `vs ${COMPARATOR_SYMBOLS[rule.comparator]} ${threshold} threshold`;
  } else if (openEvent) {
    const line = formatMetricValue(rule.metric, openEvent.threshold);
    const side = isUpward(rule.comparator) ? "upper" : "lower";
    text = line === null ? null : `vs ${line} ${side} limit`;
  }
  return text === null ? null : <span className="text-lg text-rail-muted-foreground">{text}</span>;
}

function SinceTile({ rule, now }: { rule: AlertRule; now: Date }) {
  const state = rule.state;
  if (state === null) {
    return (
      <HeroTile label="State since">
        <HeroUnknown reason="This rule hasn't been evaluated yet." />
      </HeroTile>
    );
  }
  return (
    <HeroTile label={state.state === "firing" ? "Firing since" : "OK since"}>
      <TimeText
        iso={state.since}
        text={whenLabel(state.since, now)}
        fallback={<HeroUnknown reason="The time this state began wasn't recorded." />}
      />
    </HeroTile>
  );
}

interface EventTileProps {
  firing: boolean;
  openEvent: AlertEvent | null | undefined;
  now: Date;
}

/** While firing, who acknowledged the open event; otherwise there is no open event. */
function EventTile({ firing, openEvent, now }: EventTileProps) {
  if (!firing) {
    return <HeroTile label="Open event">None</HeroTile>;
  }
  if (openEvent === undefined) {
    return (
      <HeroTile label="Acknowledged">
        <HeroUnknown reason="The rule's events couldn't be loaded." />
      </HeroTile>
    );
  }
  if (openEvent === null || openEvent.acknowledged_at === null) {
    return <HeroTile label="Acknowledged">Not yet</HeroTile>;
  }
  const by = openEvent.acknowledged_by;
  return (
    <HeroTile label="Acknowledged">
      {by ? personName(by) : "A removed account"} ·{" "}
      <TimeText
        iso={openEvent.acknowledged_at}
        text={compactRelative(openEvent.acknowledged_at, now)}
      />
    </HeroTile>
  );
}

function HeroTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-tile bg-rail-tile px-4 py-3.5">
      <span className="text-overline text-rail-muted-foreground uppercase">{label}</span>
      <span className="text-sm font-semibold [overflow-wrap:anywhere] text-hero-card-foreground">
        {children}
      </span>
    </div>
  );
}
