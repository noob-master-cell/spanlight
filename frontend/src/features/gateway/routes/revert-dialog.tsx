import { X } from "lucide-react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { useState } from "react";
import { toast } from "sonner";

import { Callout } from "@/components/callout";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage, isApiError, type Route } from "@/lib/api";

import { fieldLabel } from "./config-labels";
import { useRevertRoute } from "./routes-queries";

interface RevertDialogProps {
  route: Route;
  /**
   * The version to restore and the version the revert will save (one past the newest in the
   * freshly loaded history); the dialog is open while it is set.
   */
  target: { version: number; next: number } | null;
  /** The editor has unsaved edits: the dialog says the revert replaces them. */
  dirty: boolean;
  onClose: () => void;
  onReverted: (route: Route) => void;
}

/**
 * The reason a revert was refused with `422`: the old config no longer passes today's rules,
 * e.g. a credential it targets was deleted. Null for any other failure.
 */
function invalidConfigMessage(error: unknown): string | null {
  if (!isApiError(error) || error.status !== 422) {
    return null;
  }
  const first = error.fieldErrors[0];
  if (!first) {
    return error.detail ?? error.message;
  }
  return `${fieldLabel(first.field.replace(/^config\./, ""))}: ${first.message}`;
}

/** Figma "Gateway — Route editor — revert confirm", with the spec §9.1 copy. */
export function RevertDialog({ route, target, dirty, onClose, onReverted }: RevertDialogProps) {
  const revert = useRevertRoute(route.id);
  const pending = revert.isPending;
  const [refused, setRefused] = useState<string | null>(null);

  function close() {
    setRefused(null);
    onClose();
  }

  function confirm() {
    if (target === null) {
      return;
    }
    revert.mutate(target.version, {
      onSuccess: (saved) => {
        toast.success(
          `Reverted ${saved.name} to version ${target.version}. Saved as version ${saved.version}.`,
        );
        close();
        onReverted(saved);
      },
      onError: (error) => {
        const message = invalidConfigMessage(error);
        if (message === null) {
          toast.error(errorMessage(error));
        } else {
          setRefused(message);
        }
      },
    });
  }

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !pending) {
          close();
        }
      }}
    >
      <AlertDialogContent className="max-w-[440px] gap-5 rounded-card p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <AlertDialogTitle>Revert route</AlertDialogTitle>
            <AlertDialogDescription className="[overflow-wrap:anywhere]">
              Revert {route.name} to version {target?.version ?? ""}? This saves a new version{" "}
              {target?.next ?? ""} with the old settings.
              {dirty ? " Reverting discards your unsaved changes." : null}
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
        {refused === null ? null : (
          <Callout tone="danger" role="alert" title="This version can't be restored">
            {refused}
          </Callout>
        )}
        <AlertDialogFooter className="flex-row justify-end gap-2.5">
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="primary" loading={pending} disabled={refused !== null} onClick={confirm}>
            Revert to version {target?.version ?? ""}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
