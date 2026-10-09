import { useCallback, useSyncExternalStore } from "react";

/** Phones get the compact variants of the landing illustrations (Figma "Landing — Mobile"). */
export const COMPACT_QUERY = "(max-width: 767px)";

/** Whether `query` currently matches, updating when the viewport changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", onChange);
      return () => {
        mediaQuery.removeEventListener("change", onChange);
      };
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
