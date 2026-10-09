import { useState, type ReactElement } from "react";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { CreatedGatewayKey } from "@/lib/api";

import { CreateKeyForm } from "./create-key-form";
import { KeySecretReveal } from "./key-secret-reveal";

interface CreateKeyDialogProps {
  /** The element that opens the dialog: the "Create key" button. */
  trigger: ReactElement;
}

/**
 * Two steps in one dialog: set the key up, then show its secret once. The secret lives only in
 * the dialog body's state, which unmounts when the dialog closes.
 */
export function CreateKeyDialog({ trigger }: CreateKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape, Cancel, the close mark and an outside click all end up here: while the key is
        // being made, none of them may close the dialog and lose it.
        if (next || !pending) {
          setOpen(next);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* Mounted only while open, so closing the dialog discards the secret. */}
      {open ? <CreateKeyDialogBody onPendingChange={setPending} /> : null}
    </Dialog>
  );
}

interface Created {
  key: CreatedGatewayKey;
  routeName: string | null;
}

function CreateKeyDialogBody({ onPendingChange }: { onPendingChange: (pending: boolean) => void }) {
  const [created, setCreated] = useState<Created | null>(null);

  return (
    <DialogContent
      hideClose
      className="max-h-[calc(100dvh-2rem)] max-w-[580px] gap-0 overflow-y-auto rounded-card p-6 sm:p-7"
      onInteractOutside={(event) => {
        // A stray click outside would lose the secret for good.
        if (created) {
          event.preventDefault();
        }
      }}
    >
      {created ? (
        <KeySecretReveal created={created.key} routeName={created.routeName} />
      ) : (
        <CreateKeyForm
          onPendingChange={onPendingChange}
          onCreated={(key, routeName) => {
            setCreated({ key, routeName });
          }}
        />
      )}
    </DialogContent>
  );
}
