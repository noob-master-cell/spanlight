import type { AlertEvent, User } from "@/lib/api";

import { formatSpan, spanBetween } from "./alert-time";

export type MarkerKind = "fired" | "resolved" | "acknowledged";

export interface TimelineMarker {
  /** Unique across the timeline: the event id and the kind. */
  key: string;
  kind: MarkerKind;
  /** When it happened (ISO). */
  at: string;
  event: AlertEvent;
}

/**
 * One alert event is up to three moments on the timeline: it fired, it resolved, someone
 * acknowledged it. Flattens the loaded events into those markers, most recent first; markers
 * at the same instant keep fire → acknowledge → resolve reading upward.
 */
export function timelineMarkers(events: readonly AlertEvent[]): TimelineMarker[] {
  const markers: TimelineMarker[] = [];
  for (const event of events) {
    markers.push({ key: `${event.id}:fired`, kind: "fired", at: event.started_at, event });
    if (event.acknowledged_at !== null) {
      markers.push({
        key: `${event.id}:acknowledged`,
        kind: "acknowledged",
        at: event.acknowledged_at,
        event,
      });
    }
    if (event.resolved_at !== null) {
      markers.push({
        key: `${event.id}:resolved`,
        kind: "resolved",
        at: event.resolved_at,
        event,
      });
    }
  }
  const order: Record<MarkerKind, number> = { resolved: 0, acknowledged: 1, fired: 2 };
  return markers.sort((a, b) => {
    const delta = Date.parse(b.at) - Date.parse(a.at);
    return delta !== 0 && !Number.isNaN(delta) ? delta : order[a.kind] - order[b.kind];
  });
}

/** The open event (fired, not resolved) among the loaded ones, if any. */
export function openEvent(events: readonly AlertEvent[]): AlertEvent | null {
  return events.find((event) => event.resolved_at === null) ?? null;
}

/** "after 38 min": how long a resolved event was firing; null when a time is unreadable. */
export function resolvedAfter(event: AlertEvent): string | null {
  const span = spanBetween(event.started_at, event.resolved_at);
  return span === null ? null : `after ${formatSpan(span)}`;
}

/** A person's display name: their name, or their email when the name is blank. */
export function personName(user: User): string {
  return user.name.trim() === "" ? user.email : user.name;
}
