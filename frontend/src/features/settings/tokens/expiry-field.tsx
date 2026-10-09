import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useId } from "react";

import { cn } from "@/lib/utils";

import { EXPIRY_OPTIONS, expiryHint, type ExpiryChoice } from "./expiry";

interface ExpiryFieldProps {
  value: ExpiryChoice;
  onChange: (value: ExpiryChoice) => void;
}

/**
 * Figma "Expires": 30 / 90 / 365 days or Never in a muted track, the chosen one in ink, and the
 * date it comes to underneath. A radio group, so arrow keys move between the choices.
 */
export function ExpiryField({ value, onChange }: ExpiryFieldProps) {
  const labelId = useId();
  const hintId = useId();

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-label leading-5 font-semibold text-foreground">
        Expires
      </span>
      <RadioGroupPrimitive.Root
        value={value}
        onValueChange={(next) => {
          const option = EXPIRY_OPTIONS.find((candidate) => candidate.value === next);
          if (option) {
            onChange(option.value);
          }
        }}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        orientation="horizontal"
        className="flex items-start gap-1 rounded-full bg-surface-muted p-1"
      >
        {EXPIRY_OPTIONS.map((option) => (
          <RadioGroupPrimitive.Item
            key={option.value}
            value={option.value}
            className={cn(
              "flex h-9 min-w-0 flex-1 items-center justify-center rounded-full px-2 text-sm font-medium whitespace-nowrap text-muted-foreground sm:px-4",
              "transition-[background-color,color] duration-200 ease-out-quart",
              "focus-visible:outline-offset-0",
              "data-[state=unchecked]:hover:text-foreground",
              "data-[state=checked]:bg-ink data-[state=checked]:font-semibold data-[state=checked]:text-ink-foreground",
            )}
          >
            {option.label}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
      <p id={hintId} aria-live="polite" className="text-xs font-medium text-muted-foreground">
        {expiryHint(value)}
      </p>
    </div>
  );
}
