import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { useRef, useState, type ReactElement } from "react";
import { toast } from "sonner";

import { Callout } from "@/components/callout";
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
import { useProjectParams } from "@/features/shell";
import { errorMessage, type Credential, type Route } from "@/lib/api";

import { isCredentialInUse, routeNamedIn } from "./credential-model";
import { useDeleteCredential } from "./credentials-queries";

interface DeleteCredentialDialogProps {
  credential: Credential;
  /** The delete icon button. */
  trigger: ReactElement;
  /** The current project's routes, to link the route a `CREDENTIAL_IN_USE` answer names. */
  routes: readonly Route[];
}

/**
 * Figma "Delete credential" and "Delete credential — in use". The row already disables Delete for
 * a credential a route of this project uses; this is the fallback for routes of other projects,
 * which only the server can see: its `409 CREDENTIAL_IN_USE` becomes a danger callout.
 */
export function DeleteCredentialDialog({
  credential,
  trigger,
  routes,
}: DeleteCredentialDialogProps) {
  const { orgId, projectId } = useProjectParams();
  const deleteCredential = useDeleteCredential();
  const [open, setOpen] = useState(false);
  const [inUse, setInUse] = useState<string | null>(null);
  const pending = deleteCredential.isPending;
  // The delete button that opened the dialog and the card around the list.
  const opener = useRef<{ button: HTMLElement; card: HTMLElement | null } | null>(null);

  async function confirm() {
    try {
      await deleteCredential.mutateAsync(credential.id);
      toast.success(`Deleted credential "${credential.name}".`);
      setOpen(false);
    } catch (error) {
      if (isCredentialInUse(error)) {
        setInUse(errorMessage(error));
      } else {
        toast.error(errorMessage(error));
      }
    }
  }

  const route = inUse === null ? null : routeNamedIn(inUse, routes);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) {
          return;
        }
        setOpen(next);
        if (!next) {
          setInUse(null);
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
          // A deleted credential takes its row, and the delete button with it, so focus would
          // fall to the page. Move it to the list heading instead (WCAG 2.4.3).
          const { button, card } = opener.current ?? {};
          const heading = card?.querySelector<HTMLElement>("h2");
          if (button && !button.isConnected && heading) {
            event.preventDefault();
            heading.tabIndex = -1;
            heading.focus();
          }
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <AlertDialogTitle className="[overflow-wrap:anywhere]">
              Delete {credential.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Routes can&rsquo;t use a deleted credential. This can&rsquo;t be undone.
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
        {inUse === null ? null : (
          <Callout
            tone="danger"
            title="Credential in use"
            role="alert"
            action={
              route ? (
                <Button size="sm" asChild>
                  <Link
                    to="/$orgId/$projectId/gateway/routes/$routeId"
                    params={{ orgId, projectId, routeId: route.id }}
                  >
                    Open route
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {inUse}
          </Callout>
        )}
        <AlertDialogFooter className="flex-row justify-end gap-2.5">
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="danger"
            loading={pending}
            disabled={inUse !== null}
            onClick={() => {
              void confirm();
            }}
          >
            Delete credential
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
