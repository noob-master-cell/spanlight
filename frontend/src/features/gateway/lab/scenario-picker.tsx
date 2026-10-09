import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useId } from "react";

import type { FaultScenario } from "@/lib/api";
import { cn } from "@/lib/utils";

import { SCENARIOS, type ScenarioMeta } from "./scenario-params";

interface ScenarioPickerProps {
  value: FaultScenario;
  onChange: (value: FaultScenario) => void;
}

/** Figma "Gateway/Scenario card" in a 3 x 3 grid (one column on a phone): one scenario at a time. */
export function ScenarioPicker({ value, onChange }: ScenarioPickerProps) {
  const labelId = useId();

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-label leading-5 font-semibold text-foreground">
        Scenario
      </span>
      <RadioGroupPrimitive.Root
        value={value}
        onValueChange={(next) => {
          const scenario = SCENARIOS.find((candidate) => candidate.id === next);
          if (scenario) {
            onChange(scenario.id);
          }
        }}
        aria-labelledby={labelId}
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      >
        {SCENARIOS.map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} />
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: ScenarioMeta }) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <RadioGroupPrimitive.Item
      value={scenario.id}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        "group flex min-h-[44px] items-start gap-2.5 rounded-input text-left transition-colors",
        // The border grows from 1 to 1.5 px as the card is chosen; the padding gives it back.
        "border border-border-strong bg-surface p-3 data-[state=unchecked]:hover:bg-surface-muted",
        "data-[state=checked]:border-[1.5px] data-[state=checked]:border-accent data-[state=checked]:bg-surface-selected data-[state=checked]:p-[11.5px]",
      )}
    >
      <span className="flex h-5 w-[18px] shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="flex size-[18px] items-center justify-center rounded-full border-[1.5px] border-subtle-foreground bg-surface group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent"
        >
          <span className="hidden size-1.5 rounded-full bg-accent-foreground group-data-[state=checked]:block" />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={titleId} className="text-sm font-semibold text-foreground">
          {scenario.title}
        </span>
        <span className="font-mono text-xs text-subtle-foreground">{scenario.id}</span>
        <span id={descriptionId} className="text-xs font-medium text-muted-foreground">
          {scenario.description}
        </span>
      </span>
    </RadioGroupPrimitive.Item>
  );
}
