import { formatDate, pluralize } from "@/lib/format";

/** The expiry a person picks when creating a token or an API key. */
export type ExpiryChoice = "30" | "90" | "365" | "never";

interface ExpiryOption {
  value: ExpiryChoice;
  label: string;
  /** Days from now; null for a credential that never expires. */
  days: number | null;
}

export const EXPIRY_OPTIONS: readonly ExpiryOption[] = [
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "365", label: "365 days", days: 365 },
  { value: "never", label: "Never", days: null },
];

export const DEFAULT_EXPIRY: ExpiryChoice = "90";

/** Within this many days of expiring, a row says so in amber. */
export const EXPIRING_SOON_DAYS = 7;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function daysFor(choice: ExpiryChoice): number | null {
  return EXPIRY_OPTIONS.find((option) => option.value === choice)?.days ?? null;
}

/** The moment a choice expires, or null for "Never". */
export function expiryDate(choice: ExpiryChoice, now: Date = new Date()): Date | null {
  const days = daysFor(choice);
  return days === null ? null : new Date(now.getTime() + days * DAY_MS);
}

/** What the API takes as `expires_at`: an ISO time, or null for no expiry. */
export function expiryTimestamp(choice: ExpiryChoice, now: Date = new Date()): string | null {
  return expiryDate(choice, now)?.toISOString() ?? null;
}

/** The line under the expiry control: "Expires on Jan 7, 2027." */
export function expiryHint(choice: ExpiryChoice, now: Date = new Date()): string {
  const date = formatDate(expiryDate(choice, now)?.toISOString());
  return date === null ? "It stays valid until you revoke it." : `Expires on ${date}.`;
}

/** The reveal line: "Expires Jan 7, 2027", or "Never expires". */
export function expiryDescription(expiresAt: string | null): string {
  if (expiresAt === null) {
    return "Never expires";
  }
  return `Expires ${formatDate(expiresAt) ?? expiresAt}`;
}

export type ExpiryState = "never" | "later" | "soon" | "expired";

export function expiryState(expiresAt: string | null, now: Date = new Date()): ExpiryState {
  if (expiresAt === null) {
    return "never";
  }
  const remaining = new Date(expiresAt).getTime() - now.getTime();
  if (Number.isNaN(remaining)) {
    return "later";
  }
  if (remaining <= 0) {
    return "expired";
  }
  return remaining <= EXPIRING_SOON_DAYS * DAY_MS ? "soon" : "later";
}

/** "in 5 days" for a credential about to expire. */
function timeLeft(expiresAt: string, now: Date): string {
  const remaining = new Date(expiresAt).getTime() - now.getTime();
  if (remaining < HOUR_MS) {
    return "in under an hour";
  }
  if (remaining <= DAY_MS) {
    return `in ${pluralize(Math.ceil(remaining / HOUR_MS), "hour")}`;
  }
  return `in ${pluralize(Math.ceil(remaining / DAY_MS), "day")}`;
}

/** The Expires cell of a list row: "Never", a date, or "in 5 days" within a week of the end. */
export function expiryCellText(expiresAt: string | null, now: Date = new Date()): string {
  if (expiresAt === null) {
    return "Never";
  }
  return expiryState(expiresAt, now) === "soon"
    ? timeLeft(expiresAt, now)
    : (formatDate(expiresAt) ?? expiresAt);
}
