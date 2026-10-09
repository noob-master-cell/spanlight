import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

/** Caret height (px), Figma's 6px. */
const CARET_HEIGHT = 6;
/**
 * Clear space (px) between the caret tip and the trigger: the focus ring's 2px width plus its 2px
 * offset, because a tooltip opens on keyboard focus and must not cover the ring.
 */
const FOCUS_RING_GAP = 4;

/**
 * The 12 x 6 caret, pointing down. The bubble has a border in dark mode, so the caret carries
 * one along its slanted edges, and its fill reaches 1px past the base to cut the bubble's border
 * line where the caret joins it. In light mode the stroke is transparent.
 */
function CaretShape(props: ComponentProps<"svg">) {
  // `viewBox` comes after the spread: the Radix Arrow forces its own (30 x 10) on its child.
  return (
    <svg {...props} viewBox="0 0 12 6" aria-hidden className="block overflow-visible fill-rail">
      <polygon points="0,-1 12,-1 12,0 6,6 0,0" />
      <polyline
        points="0,0 6,6 12,0"
        fill="none"
        className="stroke-transparent dark:stroke-border"
      />
    </svg>
  );
}

type TooltipCaret = "center" | "start";

interface TooltipContentProps extends ComponentProps<typeof TooltipPrimitive.Content> {
  /**
   * Where the caret points (Figma "Tooltip"). `center` follows the trigger's centre. `start`
   * puts it 14px from the left edge and aligns the bubble with the trigger's start, for wide
   * triggers such as a chip; it only supports `side` top and bottom.
   */
  caret?: TooltipCaret;
}

function TooltipContent({
  className,
  caret = "center",
  align = caret === "start" ? "start" : "center",
  // The Radix Arrow adds its own height to the offset; the custom `start` caret does not.
  sideOffset = caret === "start" ? CARET_HEIGHT + FOCUS_RING_GAP : FOCUS_RING_GAP,
  children,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "group relative z-50 max-w-xs animate-fade-in rounded-tooltip bg-rail px-3 py-2 text-xs font-medium text-rail-foreground shadow-lg dark:border dark:border-border",
          className,
        )}
        {...props}
      >
        {children}
        {caret === "start" ? (
          <span
            aria-hidden
            className="absolute left-3.5 group-data-[side=bottom]:bottom-full group-data-[side=bottom]:rotate-180 group-data-[side=top]:top-full"
          >
            <CaretShape width={12} height={CARET_HEIGHT} />
          </span>
        ) : (
          <TooltipPrimitive.Arrow asChild width={12} height={CARET_HEIGHT}>
            <CaretShape />
          </TooltipPrimitive.Arrow>
        )}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: ComponentProps<typeof TooltipPrimitive.Content>["side"];
  caret?: TooltipCaret;
}

/** Convenience wrapper: `<Tooltip content="…"><button /></Tooltip>`. */
function Tooltip({ content, children, side, caret }: TooltipProps) {
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} caret={caret}>
        {content}
      </TooltipContent>
    </TooltipRoot>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger };
