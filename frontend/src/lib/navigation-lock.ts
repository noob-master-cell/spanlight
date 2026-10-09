import { useBlocker } from "@tanstack/react-router";
import { useEffect } from "react";

/** How many screens hold the lock right now. More than one is possible in principle, so count. */
let holders = 0;

/** Whether something on screen must not be left yet, so global shortcuts should stand down. */
export function isNavigationLocked(): boolean {
  return holders > 0;
}

/**
 * Holds the person on this screen while `active`: in-app navigation is blocked (links, the browser's
 * back button, the global "G then…" shortcuts), a reload or closing the tab asks first, and
 * `isNavigationLocked()` is true so the shortcut and command-palette hooks stand down. It is for
 * the moments a screen holds something that can't be shown again, such as recovery codes, and is
 * released as soon as `active` turns false or the screen unmounts.
 */
export function useNavigationLock(active: boolean): void {
  useBlocker({
    shouldBlockFn: () => true,
    enableBeforeUnload: true,
    disabled: !active,
  });

  useEffect(() => {
    if (!active) {
      return;
    }
    holders += 1;
    return () => {
      holders -= 1;
    };
  }, [active]);
}
