import type { ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";

interface DisabledReasonProps {
  /** Why the wrapped control is disabled, e.g. "Only admins can revoke other people's keys." */
  reason: string;
  /** A disabled control. Disabled elements get no pointer or focus events, so we wrap it. */
  children: ReactNode;
}

/** Shows a tooltip explaining why a disabled control can't be used. Keyboard reachable. */
export function DisabledReason({ reason, children }: DisabledReasonProps) {
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} className="inline-flex rounded-md">
        {children}
        <span className="sr-only">{reason}</span>
      </span>
    </Tooltip>
  );
}
