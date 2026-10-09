import { X } from "lucide-react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { useRef, useState, type ReactElement, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  /** The element that opens the dialog: the row's action button. */
  trigger: ReactElement;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /**
   * Runs the action. The dialog stays open with a spinner until this settles and closes only on
   * success; the caller reports a failure, e.g. with a toast.
   */
  onConfirm: () => Promise<unknown>;
}

/**
 * Figma "Revoke token" and "Revoke key": one question, one danger button, for every row action
 * that removes something (revoke, remove). It waits for its async action, and when the row goes
 * away with it, moves focus to the card the row sat in.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // What had focus when the dialog opened (the row's action) and the card the row sits in.
  const opener = useRef<{ button: HTMLElement; card: HTMLElement | null } | null>(null);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // The caller already announced the error; stay open so the person can try again.
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
      <AlertDialogContent
        className="max-w-[440px] gap-5 rounded-card p-6 sm:p-7"
        onOpenAutoFocus={() => {
          const button = document.activeElement;
          opener.current =
            button instanceof HTMLElement
              ? { button, card: button.closest<HTMLElement>('[role="region"]') }
              : null;
        }}
        onCloseAutoFocus={(event) => {
          // A removed row leaves the list, and its button with it, so focus would fall to the
          // page. Move it to the card that held the row instead (WCAG 2.4.3).
          const { button, card } = opener.current ?? {};
          if (button && !button.isConnected && card?.isConnected) {
            event.preventDefault();
            card.tabIndex = -1;
            card.focus();
          }
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <AlertDialogTitle className="[overflow-wrap:anywhere]">{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </div>
          {/* The shared AlertDialogCancel is a styled button; this one is the round close mark. */}
          <AlertDialogPrimitive.Cancel asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              disabled={pending}
              className="bg-surface-muted"
            >
              <X aria-hidden />
            </Button>
          </AlertDialogPrimitive.Cancel>
        </div>
        <AlertDialogFooter className="flex-row justify-end gap-2.5">
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="danger"
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
