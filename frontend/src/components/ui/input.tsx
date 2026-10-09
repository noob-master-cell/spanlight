import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Shared field styling (Figma "Control/Input"): 46px, 14px radius, strong hairline. */
const inputClasses = cn(
  "flex h-[46px] w-full min-w-0 rounded-input border border-input bg-surface px-4 text-sm text-foreground",
  "placeholder:text-subtle-foreground",
  "transition-colors duration-200 ease-out-quart",
  // The ring is the global :focus-visible outline; a field also turns its border violet.
  "focus-visible:border-accent",
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
  "aria-invalid:border-[1.5px] aria-invalid:border-danger",
  "aria-invalid:focus-visible:outline-danger",
  "file:border-0 file:bg-transparent file:text-sm file:font-medium",
);

function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} className={cn(inputClasses, className)} {...props} />;
}

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(inputClasses, "h-auto min-h-24 py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

export { Input, Textarea, inputClasses };
