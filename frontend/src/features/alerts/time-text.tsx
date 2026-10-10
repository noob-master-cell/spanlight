import type { ReactNode } from "react";

import { UnknownValue } from "@/components/unknown-value";
import { Tooltip } from "@/components/ui/tooltip";

import { exactTime } from "./alert-time";

interface TimeTextProps {
  iso: string | null | undefined;
  /** The time written for people ("14 min ago · Today 14:22"); null when it can't be. */
  text: string | null;
  /** Shown instead when there is no time; the unknown "—" by default. */
  fallback?: ReactNode;
}

/** A time written for people, with the exact 24-hour time in a keyboard-reachable tooltip. */
export function TimeText({ iso, text, fallback }: TimeTextProps) {
  const exact = exactTime(iso);
  if (text === null || exact === null || !iso) {
    return fallback ?? <UnknownValue reason="The time could not be read." />;
  }
  return (
    <Tooltip content={exact}>
      <time dateTime={iso} tabIndex={0} className="rounded-sm tabular">
        {text}
      </time>
    </Tooltip>
  );
}
