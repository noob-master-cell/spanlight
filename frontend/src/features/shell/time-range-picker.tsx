import { useNavigate } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { useState, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import {
  describeRange,
  MAX_WINDOW_MS,
  RANGE_LABELS,
  RANGE_PRESETS,
  type RangePreset,
} from "@/lib/time-range";
import { cn } from "@/lib/utils";

import { useProjectFilters } from "./project-context";

const PRESET_OPTIONS: SegmentedOption<RangePreset>[] = RANGE_PRESETS.map((preset) => ({
  value: preset,
  label: preset,
  srLabel: RANGE_LABELS[preset].toLowerCase(),
}));

/** `<input type="datetime-local">` wants local time without a zone: 2026-10-07T14:30 */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

/**
 * The time window for project data (Figma "Control/Time range"): a segmented pill for the
 * presets, plus a calendar pill that opens a custom from/to range.
 */
export function TimeRangePicker() {
  const navigate = useNavigate();
  const { range } = useProjectFilters();
  const preset = range.value === "custom" ? null : range.value;

  function selectPreset(next: RangePreset) {
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, range: next, from: undefined, to: undefined }),
    });
  }

  return (
    <div className="flex items-center gap-2">
      <SegmentedControl
        aria-label="Time range"
        value={preset}
        onValueChange={selectPreset}
        options={PRESET_OPTIONS}
      />
      <CustomRangePopover />
    </div>
  );
}

function CustomRangePopover() {
  const navigate = useNavigate();
  const { range } = useProjectFilters();
  const isCustom = range.value === "custom";
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => toLocalInputValue(range.from));
  const [customTo, setCustomTo] = useState(() => toLocalInputValue(range.to));
  const [customError, setCustomError] = useState<string | null>(null);

  function applyCustom(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = new Date(customFrom);
    const to = new Date(customTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      setCustomError("Enter both a start and an end time.");
      return;
    }
    if (from >= to) {
      setCustomError("The start must be before the end.");
      return;
    }
    if (to.getTime() - from.getTime() > MAX_WINDOW_MS) {
      setCustomError("Ranges can be at most 90 days long.");
      return;
    }
    setCustomError(null);
    void navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        range: "custom" as const,
        from: from.toISOString(),
        to: to.toISOString(),
      }),
    });
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setCustomFrom(toLocalInputValue(range.from));
          setCustomTo(toLocalInputValue(range.to));
          setCustomError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant={isCustom ? "primary" : "secondary"}
          size={isCustom ? "md" : "icon"}
          aria-label={isCustom ? `Custom range: ${describeRange(range)}` : "Custom range"}
          className={cn(isCustom && "max-w-64")}
        >
          <CalendarClock aria-hidden />
          {isCustom ? <span className="truncate">{describeRange(range)}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form onSubmit={applyCustom} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <p className="text-card">Custom range</p>
            <p className="text-xs text-muted-foreground">Up to 90 days, in your local time.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="range-from">From</Label>
            <Input
              id="range-from"
              type="datetime-local"
              value={customFrom}
              onChange={(event) => {
                setCustomFrom(event.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="range-to">To</Label>
            <Input
              id="range-to"
              type="datetime-local"
              value={customTo}
              onChange={(event) => {
                setCustomTo(event.target.value);
              }}
            />
          </div>
          {customError ? (
            <p role="alert" className="text-xs font-medium text-danger-text">
              {customError}
            </p>
          ) : null}
          <Button type="submit" variant="primary" className="self-end">
            Apply range
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
