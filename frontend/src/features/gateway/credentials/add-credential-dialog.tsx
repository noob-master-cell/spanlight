import { useState, type ReactElement } from "react";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

import { AddCredentialForm } from "./add-credential-form";

interface AddCredentialDialogProps {
  /**
   * The element that opens the dialog: the "Add credential" button. When `disabled` it should be
   * `aria-disabled`, not `disabled`, so it keeps focus and can point at its reason.
   */
  trigger: ReactElement;
  disabled: boolean;
  orgName: string | null;
  /**
   * The server answered `409 NOT_CONFIGURED`. Called when the dialog closes, not before: the
   * dialog stays open showing the notice, and the page then stops offering Add.
   */
  onNotConfigured: () => void;
}

/** Figma "Credentials — Add credential dialog": mounted only while open, so the key never lingers. */
export function AddCredentialDialog({
  trigger,
  disabled,
  orgName,
  onNotConfigured,
}: AddCredentialDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next && disabled) {
      return;
    }
    // Escape, Cancel, the close mark and an outside click all end up here: while the key is
    // being stored, none of them may close the dialog.
    if (!next && pending) {
      return;
    }
    setOpen(next);
    if (!next && notConfigured) {
      setNotConfigured(false);
      onNotConfigured();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {open ? (
        <DialogContent
          hideClose
          className="max-h-[calc(100dvh-2rem)] max-w-[520px] gap-0 overflow-y-auto rounded-card p-6 sm:p-7"
        >
          <AddCredentialForm
            orgName={orgName}
            onPendingChange={setPending}
            onDone={() => {
              setOpen(false);
            }}
            onNotConfigured={() => {
              setNotConfigured(true);
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
