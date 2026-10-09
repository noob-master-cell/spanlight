import { ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { JsonViewer } from "@/components/json-viewer";
import { UnknownValue } from "@/components/unknown-value";
import { Button } from "@/components/ui/button";
import type { AuditEvent } from "@/lib/api";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  auditActionLabel,
  auditEventSummary,
  hasMetadata,
  shortTargetId,
  targetTypeLabel,
} from "./audit-actions";
import { InitialAvatar } from "./initial-avatar";
import { RelativeTime } from "./relative-time";
import { ColumnLabels, TileList } from "./settings-list";

/*
 * Columns by card width (container queries): the action, and a details toggle, always; time
 * and actor from 34rem; target and IP address from 48rem, the full Figma row. Whatever a row
 * hides is listed in its details panel instead.
 */
const MEDIUM = "hidden @[34rem]:flex";
const WIDE = "hidden @[48rem]:flex";

/** Figma "Settings/Audit row" tiles under their column labels, newest first. */
export function AuditLogList({ events }: { events: AuditEvent[] }) {
  return (
    <div className="@container flex flex-col gap-3">
      <ColumnLabels className="pr-3 pl-3.5 @[34rem]:flex">
        <span className="w-32">Time</span>
        <span className="w-[150px]">Actor</span>
        <span className="min-w-0 flex-1">Action</span>
        <span className={cn(WIDE, "w-[132px]")}>Target</span>
        <span className={cn(WIDE, "w-[104px]")}>IP address</span>
        <span className="w-8" />
      </ColumnLabels>
      <TileList label="Audit events">
        {events.map((event) => (
          <AuditEventRow key={event.id} event={event} />
        ))}
      </TileList>
    </div>
  );
}

function AuditEventRow({ event }: { event: AuditEvent }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const label = auditActionLabel(event.action);
  const summary = auditEventSummary(event.action, event.metadata);
  const withMetadata = hasMetadata(event.metadata);

  return (
    <li className="rounded-tile bg-surface-muted">
      <div className="flex items-center gap-3 py-2.5 pr-3 pl-3.5">
        <div className={cn(MEDIUM, "w-32 shrink-0 flex-col gap-px")}>
          <span className="font-mono text-label whitespace-nowrap text-foreground">
            {formatTimestamp(event.created_at)}
          </span>
          <RelativeTime
            iso={event.created_at}
            className="text-xs font-medium text-muted-foreground"
          />
        </div>
        <div className={cn(MEDIUM, "w-[150px] shrink-0")}>
          <AuditActor event={event} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          {label ? (
            <span className="text-sm font-semibold text-foreground">{label}</span>
          ) : (
            <span className="font-mono text-label break-all text-foreground">{event.action}</span>
          )}
          {summary ? (
            <span title={summary} className="truncate text-xs font-medium text-muted-foreground">
              {summary}
            </span>
          ) : null}
          {/* Narrow cards: who and when move under the action. */}
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground @[34rem]:hidden">
            <span className="truncate">{actorName(event)}</span>
            <span aria-hidden>·</span>
            <RelativeTime iso={event.created_at} className="shrink-0" />
          </span>
        </div>
        <div className={cn(WIDE, "w-[132px] shrink-0")}>
          <AuditTarget event={event} />
        </div>
        <div className={cn(WIDE, "w-[104px] shrink-0")}>
          <AuditIp event={event} />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={expanded ? "Hide details" : "Show details"}
          // With nothing hidden and no metadata, wide rows have no details to show.
          className={cn("shrink-0 text-muted-foreground", !withMetadata && "@[48rem]:invisible")}
          onClick={() => {
            setExpanded((current) => !current);
          }}
        >
          <ChevronRight
            aria-hidden
            className={cn("transition-transform", expanded && "rotate-90")}
          />
        </Button>
      </div>
      {expanded ? (
        <div
          id={detailsId}
          className={cn("flex flex-col gap-3 px-3.5 pb-3.5", !withMetadata && "@[48rem]:hidden")}
        >
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 text-xs font-medium @[48rem]:hidden">
            <DetailRow label="Time" className="@[34rem]:hidden">
              <span className="font-mono text-label text-foreground">
                {formatTimestamp(event.created_at)}
              </span>
            </DetailRow>
            <DetailRow label="Target">
              <AuditTarget event={event} />
            </DetailRow>
            <DetailRow label="IP address">
              <AuditIp event={event} />
            </DetailRow>
          </dl>
          {withMetadata ? <JsonViewer value={event.metadata} className="bg-surface" /> : null}
        </div>
      ) : null}
    </li>
  );
}

interface DetailRowProps {
  label: string;
  children: ReactNode;
  className?: string;
}

function DetailRow({ label, children, className }: DetailRowProps) {
  return (
    <div className={cn("contents", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function actorName(event: AuditEvent): string {
  return event.actor ? event.actor.name || event.actor.email : "System";
}

function AuditActor({ event }: { event: AuditEvent }) {
  const name = actorName(event);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <InitialAvatar
        name={name}
        seed={event.actor?.id ?? "system"}
        size="sm"
        tone={event.actor ? undefined : "neutral"}
      />
      <span
        title={event.actor?.email}
        className={cn(
          "truncate text-sm font-medium",
          event.actor ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {name}
      </span>
    </span>
  );
}

function AuditTarget({ event }: { event: AuditEvent }) {
  if (!event.target_type && !event.target_id) {
    return <UnknownValue reason="No target recorded" />;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      {event.target_type ? (
        <span className="text-xs font-medium text-muted-foreground">
          {targetTypeLabel(event.target_type)}
        </span>
      ) : null}
      {event.target_id ? (
        <span title={event.target_id} className="truncate font-mono text-label text-foreground">
          {shortTargetId(event.target_id)}
        </span>
      ) : null}
    </span>
  );
}

function AuditIp({ event }: { event: AuditEvent }) {
  if (!event.ip) {
    return <UnknownValue reason="Not recorded" className="font-mono text-label" />;
  }
  return <span className="truncate font-mono text-label text-muted-foreground">{event.ip}</span>;
}
