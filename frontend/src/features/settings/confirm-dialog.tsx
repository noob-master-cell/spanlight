import { useState, type ReactElement, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  /** The element that opens the dialog, usually a button. */
  trigger: ReactElement;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /**
   * Runs the action. The dialog stays open (with a spinner) until it settles and
   * closes only on success; the caller reports errors, e.g. with a toast.
   */
  onConfirm: () => Promise<unknown>;
}

/** An AlertDialog confirmation that waits for its async action to finish. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = true,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // The caller's mutation already announced the error; keep the dialog open to retry.
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setOpen(next);
        }
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant={destructive ? "danger" : "primary"}
            loading={pending}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
