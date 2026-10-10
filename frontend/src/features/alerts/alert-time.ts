/**
 * Short, 24-hour times for the alert screens: "14 min ago", "Today 14:22", "Oct 8, 09:41",
 * "after 38 min". Every function returns null for a missing or unreadable timestamp.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const clockFormat = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const monthDayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const fullDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const exactFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parse(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole calendar days from `now`'s day to `date`'s day: 0 today, 1 tomorrow, -1 yesterday. */
function dayOffset(date: Date, now: Date): number {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
}

export function clockTime(date: Date): string {
  return clockFormat.format(date);
}

/** "32 s ago", "14 min ago", "17 h ago", "2 d ago"; "just now" under 5 s; "in 3 min" ahead. */
export function compactRelative(iso: string | null | undefined, now: Date): string | null {
  const date = parse(iso);
  if (date === null) {
    return null;
  }
  const delta = now.getTime() - date.getTime();
  const absolute = Math.abs(delta);
  if (absolute < 5_000) {
    return "just now";
  }
  let amount: string;
  if (absolute < MINUTE_MS) {
    amount = `${Math.floor(absolute / 1000)} s`;
  } else if (absolute < HOUR_MS) {
    amount = `${Math.floor(absolute / MINUTE_MS)} min`;
  } else if (absolute < DAY_MS) {
    amount = `${Math.floor(absolute / HOUR_MS)} h`;
  } else {
    amount = `${Math.floor(absolute / DAY_MS)} d`;
  }
  return delta >= 0 ? `${amount} ago` : `in ${amount}`;
}

/** "Today 14:22", "Yesterday 21:07", "Oct 8, 09:41", or "Oct 8, 2025, 09:41" in another year. */
export function clockLabel(iso: string | null | undefined, now: Date): string | null {
  const date = parse(iso);
  if (date === null) {
    return null;
  }
  const offset = dayOffset(date, now);
  if (offset === 0) {
    return `Today ${clockTime(date)}`;
  }
  if (offset === -1) {
    return `Yesterday ${clockTime(date)}`;
  }
  const day =
    date.getFullYear() === now.getFullYear()
      ? monthDayFormat.format(date)
      : fullDateFormat.format(date);
  return `${day}, ${clockTime(date)}`;
}

/** "Today 14:22 · 14 min ago": when, then how long ago. */
export function whenLabel(iso: string | null | undefined, now: Date): string | null {
  const clock = clockLabel(iso, now);
  const relative = compactRelative(iso, now);
  return clock === null || relative === null ? null : `${clock} · ${relative}`;
}

/** The exact local time for a tooltip: "Oct 10, 2026, 14:22:05". */
export function exactTime(iso: string | null | undefined): string | null {
  const date = parse(iso);
  return date === null ? null : exactFormat.format(date);
}

/**
 * A future moment as the mute screens write it: "20:15" later today, "tomorrow, 14:36",
 * "Oct 11, 14:36" within the year, "Nov 9, 2026" with `dateOnly`.
 */
export function untilLabel(date: Date, now: Date, dateOnly = false): string {
  if (dateOnly) {
    return fullDateFormat.format(date);
  }
  const offset = dayOffset(date, now);
  if (offset === 0) {
    return clockTime(date);
  }
  if (offset === 1) {
    return `tomorrow, ${clockTime(date)}`;
  }
  return `${monthDayFormat.format(date)}, ${clockTime(date)}`;
}

/**
 * The two largest units of a duration, from days down to minutes: "38 min", "1 h 20 min",
 * "2 d 3 h"; "under 1 min" below a minute. The same rule the alert messages use.
 */
export function formatSpan(ms: number): string {
  const minutes = Math.max(Math.floor(ms / MINUTE_MS), 0);
  if (minutes === 0) {
    return "under 1 min";
  }
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  const parts: [number, string][] = [
    [days, "d"],
    [hours, "h"],
    [mins, "min"],
  ];
  return parts
    .filter(([amount]) => amount > 0)
    .slice(0, 2)
    .map(([amount, unit]) => `${amount} ${unit}`)
    .join(" ");
}

/** The milliseconds between two timestamps, or null when either is unreadable. */
export function spanBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  const start = parse(from);
  const end = parse(to);
  return start === null || end === null ? null : end.getTime() - start.getTime();
}
