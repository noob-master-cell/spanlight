import { Braces, Sheet, type LucideIcon } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { useId } from "react";

import type { ExportFormat } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FormatChoice {
  value: ExportFormat;
  title: string;
  description: string;
  icon: LucideIcon;
}

const FORMATS: readonly FormatChoice[] = [
  {
    value: "jsonl",
    title: "JSONL",
    description: "One trace per line, spans nested.",
    icon: Braces,
  },
  { value: "csv", title: "CSV", description: "One row per trace. No span payloads.", icon: Sheet },
];

interface ExportFormatPickerProps {
  value: ExportFormat;
  onChange: (format: ExportFormat) => void;
}

/**
 * The format cards (Figma "Export/Format option"): two radio cards side by side, stacked on a
 * phone. A card is selected with a violet border and a filled radio; the unselected radio ring is
 * `subtle` so the control keeps 3:1 against the dialog.
 */
export function ExportFormatPicker({ value, onChange }: ExportFormatPickerProps) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="text-label leading-5 font-semibold text-foreground">
        Format
      </p>
      <RadioGroup.Root
        value={value}
        onValueChange={(next) => {
          const choice = FORMATS.find((candidate) => candidate.value === next);
          if (choice) {
            onChange(choice.value);
          }
        }}
        aria-labelledby={labelId}
        className="flex flex-col gap-2 sm:flex-row sm:gap-3"
      >
        {FORMATS.map((choice) => (
          <FormatCard key={choice.value} choice={choice} />
        ))}
      </RadioGroup.Root>
    </div>
  );
}

function FormatCard({ choice }: { choice: FormatChoice }) {
  const Icon = choice.icon;
  return (
    <RadioGroup.Item
      value={choice.value}
      className={cn(
        "group flex min-h-[72px] flex-1 items-center gap-3 rounded-tile py-3.5 pr-4 pl-3.5 text-left transition-colors",
        "border border-border-strong bg-surface",
        "data-[state=checked]:border-[1.5px] data-[state=checked]:border-accent data-[state=checked]:bg-surface-selected",
      )}
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-input bg-surface-muted group-data-[state=checked]:bg-surface"
      >
        <Icon className="size-[18px] text-foreground group-data-[state=checked]:text-accent" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{choice.title}</span>
        <span className="text-xs leading-[1.4] font-medium text-muted-foreground">
          {choice.description}
        </span>
      </span>
      <span aria-hidden className="shrink-0">
        <span className="block size-5 rounded-full border-[1.5px] border-subtle-foreground bg-surface group-data-[state=checked]:hidden" />
        <span className="hidden size-5 items-center justify-center rounded-full bg-accent group-data-[state=checked]:flex">
          <span className="flex size-2.5 items-center justify-center rounded-full bg-accent-foreground">
            <span className="size-1 rounded-full bg-accent" />
          </span>
        </span>
      </span>
    </RadioGroup.Item>
  );
}
