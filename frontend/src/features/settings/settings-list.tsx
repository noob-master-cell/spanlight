import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the settings lists (keys, members, invites, audit events, devices):
 * rows are muted tiles with a 6px gap, under a row of overline column labels.
 */

interface ColumnLabelsProps {
  children: ReactNode;
  /** Padding to line up with the tiles, and the container width from which labels show. */
  className: string;
}

/**
 * The overline labels above a tile list, shown once the card is wide enough for columns.
 * Hidden from assistive technology: every tile names its own values.
 */
export function ColumnLabels({ children, className }: ColumnLabelsProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "hidden items-center gap-3 pt-2 pb-0.5 text-overline text-subtle-foreground uppercase",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface TileListProps {
  /** Names the list for screen readers, e.g. "API keys". */
  label: string;
  children: ReactNode;
  className?: string;
}

export function TileList({ label, children, className }: TileListProps) {
  return (
    <ul aria-label={label} className={cn("flex flex-col gap-1.5", className)}>
      {children}
    </ul>
  );
}

/** Figma "Settings/Row action": a small hairline pill for Revoke and Remove. */
export function RowAction({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn("h-8 px-3 text-sm font-medium shadow-none disabled:opacity-45", className)}
      {...props}
    />
  );
}

interface TileListSkeletonProps {
  label: string;
  rows?: number;
  /** Row height in the final list. */
  className?: string;
}

/** Shimmering tiles shaped like the rows that are loading. */
export function TileListSkeleton({ label, rows = 3, className }: TileListSkeletonProps) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-1.5">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cn("h-[52px] rounded-tile", className)} />
      ))}
    </div>
  );
}
