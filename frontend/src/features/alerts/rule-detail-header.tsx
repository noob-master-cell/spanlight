import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useId, useState } from "react";

import { DisabledReason } from "@/components/disabled-reason";
import { Button } from "@/components/ui/button";
import { useProjectParams } from "@/features/shell";
import type { AlertEvent, AlertRule } from "@/lib/api";

import { AcknowledgeButton } from "./acknowledge-button";
import { AlertsReadOnlyLine } from "./alerts-layout";
import { MuteButton } from "./mute-button";
import { RuleActionsMenu } from "./rule-actions-menu";
import { RuleEditorDialog } from "./rule-editor-dialog";
import { isFiring } from "./rule-state";
import { ruleSummary } from "./rule-summary";

/** "← Alerts": back to the rules list. */
export function BackToAlerts() {
  const { orgId, projectId } = useProjectParams();
  return (
    <Link
      to="/$orgId/$projectId/alerts"
      params={{ orgId, projectId }}
      className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ArrowLeft aria-hidden className="size-4" strokeWidth={2} />
      Alerts
    </Link>
  );
}

interface RuleDetailHeaderProps {
  rule: AlertRule;
  /** The open event; undefined while the events load or when they failed. */
  openEvent: AlertEvent | null | undefined;
  /** The events couldn't be loaded, so the open event to acknowledge is unknown. */
  eventsFailed: boolean;
  canWrite: boolean;
  now: Date;
}

/**
 * Figma "Rule header": back link, name, summary line and the actions: Edit, "…", Mute or
 * Unmute, and Acknowledge while an event is open. Members see them disabled with the lock line.
 */
export function RuleDetailHeader({
  rule,
  openEvent,
  eventsFailed,
  canWrite,
  now,
}: RuleDetailHeaderProps) {
  const { projectId } = useProjectParams();
  const [editing, setEditing] = useState(false);
  const readOnlyId = useId();
  // Points disabled controls at the visible lock line.
  const describedBy = canWrite ? undefined : readOnlyId;

  return (
    <div className="flex flex-col gap-6">
      <BackToAlerts />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-h1 [overflow-wrap:anywhere] text-foreground">{rule.name}</h1>
          <p className="text-sm text-muted-foreground">{ruleSummary(rule)}</p>
          {canWrite ? null : (
            <div id={readOnlyId} className="pt-2">
              <AlertsReadOnlyLine />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 lg:shrink-0 lg:flex-nowrap">
          <Button
            disabled={!canWrite}
            aria-describedby={describedBy}
            className="flex-1 sm:flex-none"
            onClick={() => {
              setEditing(true);
            }}
          >
            Edit
          </Button>
          <RuleActionsMenu rule={rule} canWrite={canWrite} describedBy={describedBy} />
          <MuteButton
            rule={rule}
            canWrite={canWrite}
            now={now}
            describedBy={describedBy}
            className="flex-1 sm:flex-none"
          />
          {openEvent ? (
            <AcknowledgeButton
              event={openEvent}
              canWrite={canWrite}
              now={now}
              describedBy={describedBy}
              className="max-sm:order-first max-sm:w-full"
            />
          ) : null}
          {openEvent === undefined && eventsFailed && isFiring(rule) ? (
            <span className="max-sm:order-first max-sm:w-full">
              <DisabledReason reason="The rule's events couldn't be loaded, so the open event is unknown. Retry in the Events card.">
                <Button variant="primary" disabled className="max-sm:w-full">
                  Acknowledge
                </Button>
              </DisabledReason>
            </span>
          ) : null}
        </div>
      </div>
      <RuleEditorDialog
        open={editing}
        onOpenChange={setEditing}
        projectId={projectId}
        rule={rule}
      />
    </div>
  );
}
