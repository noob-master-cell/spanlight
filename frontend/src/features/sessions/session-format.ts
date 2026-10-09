/**
 * Display helpers for session times and counts. Pure functions only; every
 * clock time is shown in the viewer's local time zone.
 */
import { describeRange, type ResolvedRange } from "@/lib/time-range";

const clockFormat = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const clockWithSecondsFormat = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const monthDayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const monthDayYearFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function parseDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "Today", "Yesterday", "Oct 6", or "Oct 6, 2025" outside the current year. */
export function dayLabel(date: Date, now: Date = new Date()): string {
  if (isSameDay(date, now)) {
    return "Today";
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return "Yesterday";
  }
  return date.getFullYear() === now.getFullYear()
    ? monthDayFormat.format(date)
    : monthDayYearFormat.format(date);
}

/** "09:12", or "09:12:04" with seconds. Null for an invalid timestamp. */
export function formatClock(iso: string, options: { seconds?: boolean } = {}): string | null {
  const date = parseDate(iso);
  if (date === null) {
    return null;
  }
  return (options.seconds ? clockWithSecondsFormat : clockFormat).format(date);
}

/** "Today 09:12:04", "Oct 6 22:14". Null for an invalid timestamp. */
export function formatDayTime(
  iso: string,
  now: Date = new Date(),
  options: { seconds?: boolean } = {},
): string | null {
  const date = parseDate(iso);
  const clock = formatClock(iso, options);
  if (date === null || clock === null) {
    return null;
  }
  return `${dayLabel(date, now)} ${clock}`;
}

/**
 * First → last activity, e.g. "Today 09:12 → 09:41". The day is repeated only
 * when the session crosses midnight: "Yesterday 23:50 → Today 00:10".
 */
export function formatSessionWindow(
  firstIso: string,
  lastIso: string,
  now: Date = new Date(),
): string | null {
  const first = parseDate(firstIso);
  const last = parseDate(lastIso);
  const start = formatDayTime(firstIso, now);
  if (first === null || last === null || start === null) {
    return null;
  }
  const end = isSameDay(first, last) ? formatClock(lastIso) : formatDayTime(lastIso, now);
  return `${start} → ${end ?? ""}`;
}

/** A short duration for list rows: "45s", "29m", "2h 5m". Null when unknown. */
export function formatCompactDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return null;
  }
  if (ms < 1000) {
    return "<1s";
  }
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** The time range as a phrase that follows "from" or "in": "the last 24 hours". */
export function rangePhrase(range: ResolvedRange): string {
  const label = describeRange(range);
  return range.value === "custom" ? label : `the ${label.toLowerCase()}`;
}

/** "1 turn", "12 turns". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

/** "Turns 1–10 of 24", "12 turns", or "Latest 100 turns" while older turns aren't loaded. */
export function turnRangeLabel(visible: number, loaded: number, hasEarlierTurns: boolean): string {
  const loadedLabel = loaded.toLocaleString("en-US");
  if (hasEarlierTurns) {
    return `Latest ${loadedLabel} turns`;
  }
  if (visible < loaded) {
    return `Turns 1–${visible.toLocaleString("en-US")} of ${loadedLabel}`;
  }
  return pluralize(loaded, "turn");
}
