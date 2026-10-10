import type { ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";

interface DisabledReasonProps {
  /** Why the wrapped control is disabled, e.g. "Only admins can revoke other people's keys." */
  reason: string;
  /** A disabled control. Disabled elements get no pointer or focus events, so we wrap it. */
  children: ReactNode;
  /**
   * The id of a visible element that already states the reason. Screen readers then read it as
   * the description instead of a hidden copy, so several disabled controls don't repeat it.
   */
  describedBy?: string;
}

/** Shows a tooltip explaining why a disabled control can't be used. Keyboard reachable. */
export function DisabledReason({ reason, children, describedBy }: DisabledReasonProps) {
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} aria-describedby={describedBy} className="inline-flex rounded-md">
        {children}
        {describedBy === undefined ? <span className="sr-only">{reason}</span> : null}
      </span>
    </Tooltip>
  );
}
