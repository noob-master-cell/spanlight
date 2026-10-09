import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { toast } from "sonner";

import { DialogHeading } from "@/components/dialog-heading";
import { DisabledReason } from "@/components/disabled-reason";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";

import { isConfirmationMismatch, matchesSlug, mismatchMessage } from "./confirm-slug";

interface ConfirmSlugDialogProps {
  /** The element that opens the dialog, usually the danger zone's button. */
  trigger: ReactElement;
  /** What has to be typed: the slug of the organization or project, exactly. */
  slug: string;
  copy: { title: string; description: string; confirmLabel: string };
  /**
   * Deletes with the typed slug. The dialog stays open, with a spinner, until it settles and closes
   * on success. A rejection is reported here (an inline note for a mismatch, a toast otherwise).
   */
  onConfirm: (confirm: string) => Promise<void>;
  /** What is about to be lost, shown between the description and the field. */
  children?: ReactNode;
}

/**
 * The typed-slug delete confirmation (Figma "Delete organization" and "Delete project" dialogs).
 * The delete button stays disabled until the slug is typed exactly, and the field has the focus
 * when the dialog opens.
 */
export function ConfirmSlugDialog({
  trigger,
  slug,
  copy,
  onConfirm,
  children,
}: ConfirmSlugDialogProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = matchesSlug(typed, slug);

  function handleOpenChange(next: boolean) {
    if (pending) {
      return;
    }
    setOpen(next);
    if (!next) {
      setTyped("");
      setMismatch(false);
    }
  }

  async function confirm() {
    if (!matches || pending) {
      return;
    }
    setPending(true);
    try {
      await onConfirm(typed);
      handleOpenChange(false);
    } catch (error) {
      if (isConfirmationMismatch(error)) {
        setMismatch(true);
      } else {
        toast.error(errorMessage(error));
      }
    } finally {
      setPending(false);
    }
  }

  const deleteButton = (
    <Button
      type="submit"
      variant="danger"
      disabled={!matches}
      loading={pending}
      className="max-sm:w-full"
    >
      {copy.confirmLabel}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        hideClose
        className="max-w-[560px] gap-5 rounded-card p-5 sm:p-7"
        onOpenAutoFocus={(event) => {
          // The field, not the close button: typing the slug is the only thing to do here.
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeading title={copy.title} description={copy.description} />
        {children}
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <FormField
            label={
              <>
                Type <code className="font-mono font-normal">{slug}</code> to confirm
              </>
            }
            error={mismatch ? mismatchMessage(slug) : undefined}
          >
            <Input
              ref={inputRef}
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setMismatch(false);
              }}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              readOnly={pending}
              className="font-mono text-label"
            />
          </FormField>
          {/* The visible error is tied to the field, but a new one is not announced by itself. */}
          <p role="status" className="sr-only">
            {mismatch ? mismatchMessage(slug) : ""}
          </p>
          <DialogFooter className="gap-2.5">
            <Button
              onClick={() => {
                handleOpenChange(false);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            {matches ? (
              deleteButton
            ) : (
              <DisabledReason reason={`Type ${slug} to confirm.`}>{deleteButton}</DisabledReason>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
