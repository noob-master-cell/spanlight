import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Form label: 13px semibold (Figma "Control/Input" label). */
function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        "text-label font-semibold text-foreground select-none peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
