import type { ReactNode } from "react";

import { UnknownValue } from "@/components/unknown-value";
import type { AuditEvent } from "@/lib/api";
import { cn } from "@/lib/utils";

import { auditActorName, shortTargetId, targetTypeLabel } from "./audit-actions";
import { InitialAvatar } from "./initial-avatar";

interface DetailRowProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function DetailRow({ label, children, className }: DetailRowProps) {
  return (
    <div className={cn("contents", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function AuditActor({ event }: { event: AuditEvent }) {
  const name = auditActorName(event);
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

export function AuditTarget({ event }: { event: AuditEvent }) {
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

export function AuditIp({ event }: { event: AuditEvent }) {
  if (!event.ip) {
    return <UnknownValue reason="Not recorded" className="font-mono text-label" />;
  }
  return <span className="truncate font-mono text-label text-muted-foreground">{event.ip}</span>;
}
