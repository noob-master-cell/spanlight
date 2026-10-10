import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Callout } from "@/components/callout";
import { DialogHeading } from "@/components/dialog-heading";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { errorMessage, type AlertRule } from "@/lib/api";
import { cn } from "@/lib/utils";

import { useMuteRule } from "./alerts-queries";
import {
  DEFAULT_MUTE_PRESET,
  isMutePresetId,
  muteEnd,
  MUTE_PRESETS,
  presetById,
  presetHint,
  type MutePreset,
  type MutePresetId,
} from "./mute-presets";

const MUTE_BODY = "The rule keeps evaluating and recording events, but sends no notifications.";

interface MuteDialogProps {
  rule: AlertRule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Figma "Alerts — Mute dialog": four presets as a radio group, each with the time the mute ends.
 * "Until I unmute" is the longest mute the server allows, 30 days.
 */
export function MuteDialog({ rule, open, onOpenChange }: MuteDialogProps) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || !pending) {
          onOpenChange(next);
        }
      }}
    >
      {/* Mounted only while open, so the preset times are computed when it opens. */}
      {open ? (
        <MuteDialogBody
          rule={rule}
          onPendingChange={setPending}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

interface MuteDialogBodyProps {
  rule: AlertRule;
  onPendingChange: (pending: boolean) => void;
  onDone: () => void;
}

function MuteDialogBody({ rule, onPendingChange, onDone }: MuteDialogBodyProps) {
  const mute = useMuteRule();
  const presetsRef = useRef<HTMLDivElement>(null);
  const [now] = useState(() => new Date());
  const [choice, setChoice] = useState<MutePresetId>(DEFAULT_MUTE_PRESET);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit() {
    // The end is measured from the moment of the click, not from when the dialog opened.
    const until = muteEnd(presetById(choice), new Date()).toISOString();
    setFailure(null);
    onPendingChange(true);
    try {
      await mute.mutateAsync({ ruleId: rule.id, until });
      toast.success(`Muted "${rule.name}".`);
      onDone();
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      onPendingChange(false);
    }
  }

  return (
    <DialogContent
      hideClose
      className="max-w-[460px] gap-5 rounded-card p-6 sm:p-7"
      onOpenAutoFocus={(event) => {
        // Start on the chosen preset, not on the close button.
        const checked = presetsRef.current?.querySelector<HTMLElement>('[data-state="checked"]');
        if (checked) {
          event.preventDefault();
          checked.focus();
        }
      }}
    >
      <DialogHeading
        title={`Mute ${rule.name}`}
        description={MUTE_BODY}
        showClose={mute.isPending ? "disabled" : true}
      />
      <RadioGroupPrimitive.Root
        value={choice}
        onValueChange={(next) => {
          if (isMutePresetId(next)) {
            setChoice(next);
          }
        }}
        ref={presetsRef}
        aria-label="Mute for"
        className="flex flex-col gap-2.5"
      >
        {MUTE_PRESETS.map((preset) => (
          <PresetCard key={preset.id} preset={preset} now={now} />
        ))}
      </RadioGroupPrimitive.Root>
      {failure === null ? null : (
        <Callout tone="danger" role="alert">
          {failure}
        </Callout>
      )}
      <div className="flex justify-end gap-2.5">
        <DialogClose asChild>
          <Button disabled={mute.isPending}>Cancel</Button>
        </DialogClose>
        <Button
          variant="primary"
          loading={mute.isPending}
          onClick={() => {
            void submit();
          }}
        >
          Mute rule
        </Button>
      </div>
    </DialogContent>
  );
}

function PresetCard({ preset, now }: { preset: MutePreset; now: Date }) {
  const titleId = useId();
  const hintId = useId();
  return (
    <RadioGroupPrimitive.Item
      value={preset.id}
      aria-labelledby={titleId}
      aria-describedby={hintId}
      className={cn(
        "group flex items-start gap-3 rounded-input text-left transition-colors",
        // The border grows from 1 to 1.5 px as the card is chosen; the padding gives it back.
        "border border-border-strong bg-surface px-3.5 py-3 data-[state=unchecked]:hover:bg-surface-muted",
        "data-[state=checked]:border-[1.5px] data-[state=checked]:border-accent data-[state=checked]:bg-surface-selected data-[state=checked]:px-[13.5px] data-[state=checked]:py-[11.5px]",
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
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={titleId} className="text-sm font-semibold text-foreground">
          {preset.label}
        </span>
        <span id={hintId} className="text-xs font-medium text-muted-foreground">
          {presetHint(preset, now)}
        </span>
      </span>
    </RadioGroupPrimitive.Item>
  );
}
