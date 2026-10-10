/*
 * The mute dialog's rules: a date up to 90 days ahead and a reason of 1 to 500 characters.
 * The server checks both again (422 INVALID_MUTE); this keeps a bad draft from being sent.
 */

export const MAX_MUTE_DAYS = 90;
export const REASON_MAX_LENGTH = 500;

/** Taken off the 90-day ceiling so a browser clock slightly ahead of the server's never loses. */
const CLOCK_MARGIN_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

export const MUTE_PRESETS = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
] as const;

export interface MuteDraft {
  /** `YYYY-MM-DD`, as a date input holds it; empty when none is chosen. */
  date: string;
  reason: string;
}

export interface MuteErrors {
  date?: string;
  reason?: string;
}

export interface MuteCheck {
  errors: MuteErrors;
  /** The ISO time to send; null while any error stands. */
  until: string | null;
}

const dateLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A local date as a date input writes it: "2026-10-17". */
export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local date `days` from now's date. */
export function dateAfterDays(now: Date, days: number): string {
  return toDateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
}

/** The last date a mute may end on, as a date input value. */
export function maxMuteDate(now: Date): string {
  return dateAfterDays(now, MAX_MUTE_DAYS);
}

/** "Jan 8, 2027": the last day, for the helper line. */
export function maxMuteLabel(now: Date): string {
  const [year, month, day] = maxMuteDate(now).split("-").map(Number);
  return dateLabel.format(new Date(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function parseDateInput(value: string, now: Date): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return null;
  }
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Validates a draft at `now`. A chosen date ends at the same time of day, local time. */
export function checkMute(draft: MuteDraft, now: Date): MuteCheck {
  const errors: MuteErrors = {};
  const reason = draft.reason.trim();
  const dateMessage = `Choose a date within ${MAX_MUTE_DAYS} days (up to ${maxMuteLabel(now)}).`;

  const date = parseDateInput(draft.date, now);
  const ceiling = now.getTime() + MAX_MUTE_DAYS * DAY_MS - CLOCK_MARGIN_MS;
  // Date inputs hold ISO dates, which compare correctly as text.
  if (date === null || draft.date > maxMuteDate(now) || date.getTime() <= now.getTime()) {
    errors.date = dateMessage;
  }
  if (reason === "") {
    errors.reason = "Add a reason.";
  } else if (reason.length > REASON_MAX_LENGTH) {
    errors.reason = `Use ${REASON_MAX_LENGTH} characters or fewer.`;
  }
  if (errors.date !== undefined || errors.reason !== undefined || date === null) {
    return { errors, until: null };
  }
  // Pull the last allowed day just inside the server's limit.
  const until = new Date(Math.min(date.getTime(), ceiling));
  return { errors, until: until.toISOString() };
}
