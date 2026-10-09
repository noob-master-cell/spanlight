import { useId } from "react";

import { cn } from "@/lib/utils";

interface MeshBackdropProps {
  /** `default` for page heroes; `soft` (half strength) for ink panels and secondary areas. */
  intensity?: "default" | "soft";
  /**
   * Positioning classes for the 760×440 mesh box, e.g. `-top-0 -right-4` (the default pins it
   * to the top-right of the nearest positioned ancestor).
   */
  className?: string;
}

/**
 * The lavender / butter / sky blurred mesh (Figma "Decor/Mesh"). Purely decorative and
 * theme-aware (mesh tokens dim in the dark theme). Place it as the first child of a
 * `relative overflow-hidden` container and give the content `relative` so it stacks above.
 */
export function MeshBackdrop({ intensity = "default", className }: MeshBackdropProps) {
  const id = useId().replace(/:/g, "");
  const blurId = `mesh-blur-${id}`;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 -right-4 h-[440px] w-[760px] select-none",
        className,
      )}
    >
      <svg
        className="absolute inset-[-59.09%_-30.26%_-6.82%_0] block"
        width="990"
        height="730"
        viewBox="0 0 990 730"
        fill="none"
        style={{ opacity: `calc(var(--mesh-opacity) * ${intensity === "soft" ? 0.6 : 1})` }}
      >
        <defs>
          <filter id={blurId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="55" />
          </filter>
        </defs>
        <ellipse
          cx="570"
          cy="320"
          rx="210"
          ry="180"
          fill="var(--mesh-1)"
          filter={`url(#${blurId})`}
        />
        <ellipse
          cx="310"
          cy="260"
          rx="190"
          ry="150"
          fill="var(--mesh-2)"
          filter={`url(#${blurId})`}
        />
        <ellipse
          cx="700"
          cy="470"
          rx="180"
          ry="150"
          fill="var(--mesh-3)"
          filter={`url(#${blurId})`}
        />
      </svg>
    </div>
  );
}
