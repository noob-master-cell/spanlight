import { Info } from "lucide-react";
import { useRef, useState } from "react";

import { TooltipContent, TooltipRoot, TooltipTrigger } from "@/components/ui/tooltip";

/** The tooltip copy, verbatim from the Phase 1 spec (§9.1). */
export const APPROXIMATE_COPY =
  "Estimated from hourly rollups. Counts and cost can lag up to 5 minutes; percentiles are accurate to about ±25 %.";

/**
 * "Estimated · hourly rollups" (Figma "Overview/Estimated chip"): the one explanation of the
 * "≈" prefix on percentile values, shown in the hero's meta line when the overview response is
 * `approximate`. A focusable button; its tooltip opens on hover and focus and closes on Esc.
 */
export function EstimatedChip() {
  const [open, setOpen] = useState(false);
  const tap = useRef({ touch: false, wasOpen: false });

  return (
    <TooltipRoot open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onPointerDown={(event) => {
            // Runs before Radix closes an open tooltip on press, so `open` is still the state
            // the tap started from.
            tap.current = { touch: event.pointerType === "touch", wasOpen: open };
          }}
          onClick={(event) => {
            // Radix opens tooltips on hover and focus only, so a tap would never show the copy
            // on a phone. On touch a tap toggles it; preventDefault skips Radix's close-on-click.
            if (tap.current.touch) {
              event.preventDefault();
              setOpen(!tap.current.wasOpen);
            }
            tap.current.touch = false;
          }}
          className="relative inline-flex shrink-0 cursor-help items-center gap-[5px] rounded-full border border-border bg-surface py-[3px] pr-[9px] pl-[7px] text-2xs font-semibold tracking-[0.02em] whitespace-nowrap text-muted-foreground normal-case after:absolute after:inset-x-0 after:-inset-y-0.5 hover:text-foreground"
        >
          <Info aria-hidden className="size-[13px]" />
          Estimated · hourly rollups
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" caret="start" collisionPadding={16} className="w-72">
        {APPROXIMATE_COPY}
      </TooltipContent>
    </TooltipRoot>
  );
}
