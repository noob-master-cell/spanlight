import { CircleAlert, CircleCheck } from "lucide-react";

import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import type { SpanStatus } from "@/lib/api";
import { formatInteger } from "@/lib/format";

function errorCountLabel(errorCount: number): string {
  return errorCount === 1 ? "1 error" : `${formatInteger(errorCount) ?? errorCount} errors`;
}

/** Icon status for compact lists (used by the sessions conversation view). */
export function TraceStatusIcon({ errorCount }: { errorCount: number }) {
  if (errorCount > 0) {
    const label = errorCountLabel(errorCount);
    return (
      <Tooltip content={label}>
        <span className="inline-flex">
          <CircleAlert aria-hidden className="size-4 text-danger" />
          <span className="sr-only">Error: {label}</span>
        </span>
      </Tooltip>
    );
  }
  return (
    <span className="inline-flex">
      <CircleCheck aria-hidden className="size-4 text-success" />
      <span className="sr-only">OK</span>
    </span>
  );
}

interface TraceStatusDotProps {
  errorCount: number;
  /** The earliest failed span's message, shown in the tooltip. */
  errorMessage?: string | null;
  /** Set inside a link or button, where a focusable tooltip trigger isn't allowed. */
  static?: boolean;
}

/**
 * List-row status (Figma "Status dot"): green for OK, rose for failed. A failed trace's dot is
 * focusable and its tooltip shows the first error message.
 */
export function TraceStatusDot({
  errorCount,
  errorMessage = null,
  static: isStatic = false,
}: TraceStatusDotProps) {
  if (errorCount === 0) {
    return <StatusDot state="ok" label="OK" />;
  }

  const summary = errorCountLabel(errorCount);
  const label = errorMessage ? `Failed, ${summary}: ${errorMessage}` : `Failed, ${summary}`;
  if (isStatic) {
    return <StatusDot state="error" label={label} />;
  }

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{summary}</span>
          {errorMessage ? <span className="font-normal break-words">{errorMessage}</span> : null}
        </span>
      }
    >
      <span
        role="img"
        tabIndex={0}
        aria-label={label}
        className="inline-flex size-4 cursor-help items-center justify-center rounded-full"
      >
        <StatusDot state="error" />
      </span>
    </Tooltip>
  );
}

/** Trace header badge: "N errors" in rose, or "OK" in green. */
export function TraceStatusBadge({ errorCount }: { errorCount: number }) {
  if (errorCount > 0) {
    return <Badge variant="danger">{errorCountLabel(errorCount)}</Badge>;
  }
  return <Badge variant="success">OK</Badge>;
}

export function SpanStatusBadge({ status }: { status: SpanStatus }) {
  if (status === "error") {
    return <Badge variant="danger">Error</Badge>;
  }
  if (status === "ok") {
    return <Badge variant="success">OK</Badge>;
  }
  return (
    <Tooltip content="The instrumentation didn't set a status">
      <Badge variant="neutral" tabIndex={0} className="cursor-help">
        Unset
      </Badge>
    </Tooltip>
  );
}
