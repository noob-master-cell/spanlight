import { Link } from "@tanstack/react-router";
import { LogOut, UserRound } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/features/auth/queries";
import { ROLE_LABELS } from "@/lib/permissions";

import { useCurrentOrg, useCurrentRole, useProjectParams } from "./project-context";
import { useSignOut } from "./use-sign-out";

/** The account tile at the bottom of the rail: avatar, name, "Role · Organization". */
export function UserMenu() {
  const { user } = useMe();
  const params = useProjectParams();
  const role = useCurrentRole();
  const org = useCurrentOrg();
  const signOut = useSignOut();
  const displayName = user.name || user.email;
  const context = [role ? ROLE_LABELS[role] : null, org?.name].filter(Boolean).join(" · ");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-3 rounded-2xl bg-rail-tile px-3 py-2.5 text-left transition-colors duration-200 hover:bg-rail-tile-hover focus-visible:outline-lime data-[state=open]:bg-rail-tile-hover"
        aria-label={`${[displayName, context].filter(Boolean).join(", ")}. Account menu`}
      >
        <span
          aria-hidden
          className="size-9 shrink-0 rounded-full bg-linear-to-r from-avatar-from to-avatar-to"
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-rail-foreground">{displayName}</span>
          {context ? (
            <span className="truncate text-xs font-medium text-rail-subtle-foreground">
              {context}
            </span>
          ) : null}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="truncate tracking-normal normal-case">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/$orgId/$projectId/settings/account" params={params}>
            <UserRound aria-hidden />
            Account settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            signOut.mutate();
          }}
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
