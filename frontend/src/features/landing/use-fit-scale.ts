import { useLayoutEffect, useState, type RefObject } from "react";

/** The factor that shrinks content designed at `designWidth` to fit `availableWidth`. */
export function fitScale(availableWidth: number, designWidth: number): number {
  if (designWidth <= 0 || availableWidth <= 0) {
    return 0;
  }
  return availableWidth / designWidth;
}

/**
 * Tracks the scale at which a fixed-width composition (e.g. a 1440px app screen) fits the
 * width of `containerRef`. Measured before paint so the first frame is already scaled.
 */
export function useFitScale(containerRef: RefObject<HTMLElement | null>, designWidth: number) {
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const update = () => {
      setScale(fitScale(container.clientWidth, designWidth));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [containerRef, designWidth]);

  return scale;
}
