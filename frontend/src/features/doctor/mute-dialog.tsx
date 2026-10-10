import { useRef, useState } from "react";
import { toast } from "sonner";

import { Callout } from "@/components/callout";
import { DialogHeading } from "@/components/dialog-heading";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";

import { useMuteInsight } from "./doctor-queries";
import { actionErrorMessage } from "./insight-errors";
import { DateField } from "./mute-date-field";
import {
  checkMute,
  MAX_MUTE_DAYS,
  maxMuteLabel,
  REASON_MAX_LENGTH,
  type MuteErrors,
} from "./mute-form";

const MUTE_BODY = "Muted insights keep counting occurrences but never notify.";

interface MuteDialogProps {
  insightId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Figma "Doctor — Mute dialog": a date up to 90 days ahead (with presets) and a reason. */
export function MuteDialog({ insightId, open, onOpenChange }: MuteDialogProps) {
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
      {/* Mounted only while open, so the dates are measured from when it opens. */}
      {open ? (
        <MuteDialogBody
          insightId={insightId}
          onPendingChange={setPending}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

interface BodyProps {
  insightId: string;
  onPendingChange: (pending: boolean) => void;
  onDone: () => void;
}

function MuteDialogBody({ insightId, onPendingChange, onDone }: BodyProps) {
  const mute = useMuteInsight(insightId);
  const [now] = useState(() => new Date());
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<MuteErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit() {
    // The end is measured from the moment of the click, not from when the dialog opened.
    const check = checkMute({ date, reason }, new Date());
    setErrors(check.errors);
    if (check.until === null) {
      focusFirstInvalid(formRef.current, check.errors);
      return;
    }
    setFailure(null);
    onPendingChange(true);
    try {
      await mute.mutateAsync({ until: check.until, reason: reason.trim() });
      toast.success("Muted the insight.");
      onDone();
    } catch (error) {
      setFailure(actionErrorMessage(error));
    } finally {
      onPendingChange(false);
    }
  }

  return (
    <DialogContent hideClose className="max-w-[540px] gap-5 rounded-card p-6 sm:p-7">
      <DialogHeading
        title="Mute this insight"
        description={MUTE_BODY}
        showClose={mute.isPending ? "disabled" : true}
      />
      <form
        ref={formRef}
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField
          label="Mute until"
          error={errors.date}
          hint={`Up to ${String(MAX_MUTE_DAYS)} days from today (${maxMuteLabel(now)}).`}
        >
          <DateField now={now} value={date} onChange={setDate} />
        </FormField>
        <FormField
          label="Reason"
          error={errors.reason}
          hint={`Required. Up to ${String(REASON_MAX_LENGTH)} characters.`}
        >
          <Textarea
            name="reason"
            rows={2}
            value={reason}
            placeholder="Why are you muting this insight?"
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </FormField>
        {failure === null ? null : (
          <Callout tone="danger" role="alert">
            {failure}
          </Callout>
        )}
        <div className="flex justify-end gap-2.5">
          <DialogClose asChild>
            <Button disabled={mute.isPending}>Cancel</Button>
          </DialogClose>
          <Button type="submit" variant="primary" loading={mute.isPending}>
            Mute insight
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

/** Moves focus to the first field with an error, so a keyboard user lands on what to fix. */
function focusFirstInvalid(form: HTMLFormElement | null, errors: MuteErrors) {
  const name = errors.date === undefined ? "reason" : "date";
  form?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();
}
