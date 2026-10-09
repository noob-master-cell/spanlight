import { formatDate, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

import { expiryCellText, expiryState } from "./expiry";

interface ExpiresTextProps {
  /** An ISO time, or null for a credential that never expires. */
  expiresAt: string | null;
  /** A date only: no "in 5 days" and no amber. For a credential that is already revoked. */
  plain?: boolean;
  className?: string;
}

/**
 * The Expires cell: "Never", a date, or "in 5 days" in amber within a week of the end. The exact
 * time is in the tooltip and the `datetime` attribute; the amber is backed by the words.
 */
export function ExpiresText({ expiresAt, plain = false, className }: ExpiresTextProps) {
  const soon = !plain && expiryState(expiresAt) === "soon";
  const text = plain ? (formatDate(expiresAt) ?? "Never") : expiryCellText(expiresAt);

  if (expiresAt === null) {
    return <span className={className}>{text}</span>;
  }
  return (
    <time
      dateTime={expiresAt}
      title={formatTimestamp(expiresAt) ?? undefined}
      className={cn(soon && "font-semibold text-warning", className)}
    >
      {text}
    </time>
  );
}
