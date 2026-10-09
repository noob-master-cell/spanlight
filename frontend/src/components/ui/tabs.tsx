import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Tabs drawn as a segmented pill (Figma "Onboarding/Snippet tab"): a surface-muted track with
 * the active tab raised on a white pill. Use for switching panels; for picking a value
 * (time range, filters) use `SegmentedControl`.
 */
const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto overflow-y-hidden rounded-full border border-border bg-surface-muted p-1",
        "[scrollbar-width:none]",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground",
        "transition-[background-color,color,box-shadow] duration-200 ease-out-quart hover:text-foreground",
        "data-[state=active]:bg-surface data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-card",
        "dark:data-[state=active]:bg-surface-hover",
        "focus-visible:outline-offset-0 disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-4 outline-none", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
