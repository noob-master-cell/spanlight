import { ArrowDown, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";

import type { UserSort, UserStats } from "@/lib/api";
import { cn } from "@/lib/utils";

import { SHOW_CALLS, SHOW_TOKENS, USER_GRID } from "./user-grid";
import { UserRow, UserRowSkeleton, UserTile, UserTileSkeleton } from "./user-row";
import { ariaSortFor } from "./user-sort";

interface UsersTableProps {
  users: UserStats[];
  sort: UserSort;
  onSort: (sort: UserSort) => void;
  /** Dim rows while results for a new sort or range are loading. */
  stale: boolean;
}

/** The desktop table. Traces, Errors and Cost sort (always highest first, unknowns last). */
export function UsersTable({ users, sort, onSort, stale }: UsersTableProps) {
  return (
    <div
      role="table"
      aria-label="End users"
      aria-busy={stale || undefined}
      className={cn("flex flex-col gap-0.5 transition-opacity", stale && "opacity-60")}
    >
      <UsersTableHead sort={sort} onSort={onSort} />
      <div role="rowgroup" className="flex flex-col gap-0.5">
        {users.map((user) => (
          <UserRow key={user.external_user_id} user={user} />
        ))}
      </div>
    </div>
  );
}

/** The phone layout: one tile per user. */
export function UserTiles({ users, stale }: { users: UserStats[]; stale: boolean }) {
  return (
    <ul
      aria-label="End users"
      aria-busy={stale || undefined}
      className={cn("flex flex-col gap-1.5 transition-opacity", stale && "opacity-60")}
    >
      {users.map((user) => (
        <li key={user.external_user_id}>
          <UserTile user={user} />
        </li>
      ))}
    </ul>
  );
}

function PlainHeader({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div role="columnheader" className={cn("truncate", className)}>
      {children}
    </div>
  );
}

interface SortHeaderProps {
  column: UserSort;
  active: UserSort;
  onSort: (sort: UserSort) => void;
  children: ReactNode;
}

function SortHeader({ column, active, onSort, children }: SortHeaderProps) {
  const isActive = column === active;
  const Icon = isActive ? ArrowDown : ArrowUpDown;
  return (
    <div role="columnheader" aria-sort={ariaSortFor(column, active)} className="flex justify-end">
      <button
        type="button"
        onClick={() => {
          onSort(column);
        }}
        className={cn(
          "inline-flex min-h-6 items-center gap-1 rounded-sm uppercase hover:text-foreground",
          isActive && "text-foreground",
        )}
      >
        {children}
        <Icon aria-hidden className="size-3" />
      </button>
    </div>
  );
}

function UsersTableHead({ sort, onSort }: Pick<UsersTableProps, "sort" | "onSort">) {
  return (
    <div role="rowgroup">
      <div
        role="row"
        className={cn(
          USER_GRID,
          "h-9 rounded-input bg-surface-muted text-overline text-muted-foreground uppercase",
        )}
      >
        <PlainHeader>User</PlainHeader>
        <SortHeader column="traces" active={sort} onSort={onSort}>
          Traces
        </SortHeader>
        <PlainHeader className={cn(SHOW_CALLS, "text-right")}>LLM calls</PlainHeader>
        <SortHeader column="errors" active={sort} onSort={onSort}>
          Errors
        </SortHeader>
        <SortHeader column="cost" active={sort} onSort={onSort}>
          Cost
        </SortHeader>
        <PlainHeader className={cn(SHOW_TOKENS, "text-right")}>Tokens</PlainHeader>
        <PlainHeader>Last seen</PlainHeader>
        <div aria-hidden />
      </div>
    </div>
  );
}

export function UsersTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-0.5">
      <div className={cn(USER_GRID, "h-9 rounded-input bg-surface-muted")} />
      {Array.from({ length: rows }, (_, index) => (
        <UserRowSkeleton key={index} />
      ))}
    </div>
  );
}

export function UserTilesSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      {Array.from({ length: rows }, (_, index) => (
        <UserTileSkeleton key={index} />
      ))}
    </div>
  );
}
