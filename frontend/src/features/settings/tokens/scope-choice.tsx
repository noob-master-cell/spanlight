import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useId } from "react";

import type { TokenScope } from "@/lib/api";
import { cn } from "@/lib/utils";

import { TOKEN_SCOPE_OPTIONS } from "./scopes";

interface ScopeChoiceProps {
  value: TokenScope;
  onChange: (value: TokenScope) => void;
}

/** Figma "Settings/Choice card": Read and Write side by side, one explanation each. */
export function ScopeChoice({ value, onChange }: ScopeChoiceProps) {
  const labelId = useId();

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-label leading-5 font-semibold text-foreground">
        Scope
      </span>
      <RadioGroupPrimitive.Root
        value={value}
        onValueChange={(next) => {
          const option = TOKEN_SCOPE_OPTIONS.find((candidate) => candidate.value === next);
          if (option) {
            onChange(option.value);
          }
        }}
        aria-labelledby={labelId}
        className="grid gap-3 sm:grid-cols-2"
      >
        {TOKEN_SCOPE_OPTIONS.map((option) => (
          <ChoiceCard key={option.value} option={option} />
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  );
}

function ChoiceCard({ option }: { option: (typeof TOKEN_SCOPE_OPTIONS)[number] }) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <RadioGroupPrimitive.Item
      value={option.value}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        "group flex items-start gap-3 rounded-input text-left transition-colors",
        // The border grows from 1 to 1.5 px as the card is chosen; the padding gives it back.
        "border border-border-strong bg-surface p-3.5 data-[state=unchecked]:hover:bg-surface-muted",
        "data-[state=checked]:border-[1.5px] data-[state=checked]:border-accent data-[state=checked]:bg-surface-selected data-[state=checked]:p-[13.5px]",
      )}
    >
      <span className="flex h-[21px] w-[18px] shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="flex size-[18px] items-center justify-center rounded-full border-[1.5px] border-subtle-foreground bg-surface group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent"
        >
          <span className="hidden size-1.5 rounded-full bg-accent-foreground group-data-[state=checked]:block" />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={titleId} className="text-sm font-semibold text-foreground">
          {option.label}
        </span>
        <span id={descriptionId} className="text-xs font-medium text-muted-foreground">
          {option.description}
        </span>
      </span>
    </RadioGroupPrimitive.Item>
  );
}
