import { X } from "lucide-react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { usePurgeGatewayCache } from "./keys-queries";

interface PurgeCacheDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The project's name, for the title. */
  projectName: string;
}

/**
 * Figma "Purge cache" confirm. Controlled, because it opens from a menu item, and a dialog
 * rendered inside a menu would unmount with it.
 */
export function PurgeCacheDialog({ open, onOpenChange, projectName }: PurgeCacheDialogProps) {
  const purge = usePurgeGatewayCache();
  const pending = purge.isPending;

  async function handleConfirm() {
    try {
      await purge.mutateAsync();
      toast.success(`Purged cached responses for ${projectName}.`);
      onOpenChange(false);
    } catch {
      // The mutation already announced the error; stay open so the person can try again.
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          onOpenChange(next);
        }
      }}
    >
      <AlertDialogContent className="max-w-[440px] gap-5 rounded-card p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <AlertDialogTitle className="[overflow-wrap:anywhere]">
              Purge cached responses for {projectName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The next identical requests go to the provider.
            </AlertDialogDescription>
          </div>
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
            Purge cache
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
