import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-xs animate-fade-in rounded-md bg-hero-card px-2.5 py-1.5 text-xs font-medium text-hero-card-foreground shadow-lg dark:border dark:border-border",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: ComponentProps<typeof TooltipPrimitive.Content>["side"];
}

/** Convenience wrapper: `<Tooltip content="…"><button /></Tooltip>`. */
function Tooltip({ content, children, side }: TooltipProps) {
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </TooltipRoot>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger };
