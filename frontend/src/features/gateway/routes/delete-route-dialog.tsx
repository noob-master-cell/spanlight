import { Link } from "@tanstack/react-router";
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
import { useProjectParams } from "@/features/shell";
import { errorMessage, type Route } from "@/lib/api";

import { isRouteInUse, useDeleteRoute } from "./routes-queries";

interface DeleteRouteDialogProps {
  route: Route;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Active keys on the route, when the key list loaded; a route in use can't be deleted. */
  keyCount: number | null;
  onDeleted?: () => void;
}

/**
 * Figma "Delete route" and "Delete route — ROUTE_IN_USE". When the key list shows the route in
 * use, Delete is disabled up front with the reason inline; the server's `409 ROUTE_IN_USE` (a key
 * created meanwhile) lands in the same callout.
 */
export function DeleteRouteDialog({
  route,
  open,
  onOpenChange,
  keyCount,
  onDeleted,
}: DeleteRouteDialogProps) {
  const { orgId, projectId } = useProjectParams();
  const deleteRoute = useDeleteRoute();
  const [serverInUse, setServerInUse] = useState<string | null>(null);
  const pending = deleteRoute.isPending;
  const inUse =
    serverInUse ??
    (keyCount !== null && keyCount > 0
      ? `${route.name} is used by ${keyCount === 1 ? "1 key" : `${keyCount} keys`}. Move ${
          keyCount === 1 ? "it" : "them"
        } to another route first.`
      : null);

  async function confirm() {
    try {
      await deleteRoute.mutateAsync(route.id);
      toast.success(`Deleted route "${route.name}".`);
      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      if (isRouteInUse(error)) {
        setServerInUse(errorMessage(error));
      } else {
        toast.error(errorMessage(error));
      }
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) {
          return;
        }
        onOpenChange(next);
        if (!next) {
          setServerInUse(null);
        }
      }}
    >
      <AlertDialogContent className="max-w-[440px] gap-5 rounded-card p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <AlertDialogTitle className="[overflow-wrap:anywhere]">
              Delete {route.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its version history is deleted too. This can&rsquo;t be undone.
              {route.is_default
                ? " It is the default route: new keys need a route picked until you make another one the default."
                : null}
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
            title="Route in use"
            role={serverInUse === null ? undefined : "alert"}
            action={
              <Button size="sm" asChild>
                <Link to="/$orgId/$projectId/gateway/keys" params={{ orgId, projectId }}>
                  Open keys
                </Link>
              </Button>
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
            Delete route
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
