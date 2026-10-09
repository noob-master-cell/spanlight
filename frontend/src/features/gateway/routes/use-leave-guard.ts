import { useBlocker } from "@tanstack/react-router";
import { useCallback, useRef } from "react";

/**
 * Keeps unsaved route edits from being lost by accident. While `active`, leaving through the app
 * (a link, the sidebar, the browser's back button) asks first, and a reload or closing the tab
 * gets the browser's own prompt. `allowLeave` lets the editor's own navigation through, e.g.
 * opening the route it just created or the list after a delete.
 */
export function useLeaveGuard(active: boolean) {
  // Read only inside the blocker callbacks, never during render.
  const allowed = useRef(false);
  // Stable, so the blocker isn't re-registered on every render (it re-renders while blocked).
  const blocking = useCallback(() => !allowed.current, []);
  const blocker = useBlocker({
    shouldBlockFn: blocking,
    enableBeforeUnload: blocking,
    disabled: !active,
    withResolver: true,
  });

  return {
    blocker,
    allowLeave: () => {
      allowed.current = true;
    },
  };
}
