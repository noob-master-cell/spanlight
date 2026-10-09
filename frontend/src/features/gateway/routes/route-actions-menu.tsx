import { Ellipsis } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage, type Route } from "@/lib/api";

import { DeleteRouteDialog } from "./delete-route-dialog";
import { useSetDefaultRoute } from "./routes-queries";

interface RouteActionsMenuProps {
  route: Route;
  /** Active keys on the route, or null while the key list is unknown. */
  keyCount: number | null;
  /** After a delete, e.g. the editor goes back to the list. */
  onDeleted?: () => void;
}

/**
 * Figma "More route actions": Make default (for a route that is not the default yet) and Delete
 * route. Shown only to people who may change routes.
 */
export function RouteActionsMenu({ route, keyCount, onDeleted }: RouteActionsMenuProps) {
  const setDefault = useSetDefaultRoute();
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon-sm" aria-label={`More actions for ${route.name}`}>
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {route.is_default ? null : (
            <DropdownMenuItem
              className="h-auto flex-col items-start gap-0.5 py-2"
              onSelect={() => {
                setDefault.mutate(route.id, {
                  onSuccess: () => toast.success(`${route.name} is now the default route.`),
                  onError: (error) => toast.error(errorMessage(error)),
                });
              }}
            >
              <span>Make default</span>
              <span className="text-xs text-muted-foreground">New keys use this route</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            destructive
            onSelect={() => {
              setDeleting(true);
            }}
          >
            Delete route
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteRouteDialog
        route={route}
        open={deleting}
        onOpenChange={setDeleting}
        keyCount={keyCount}
        onDeleted={onDeleted}
      />
    </>
  );
}
