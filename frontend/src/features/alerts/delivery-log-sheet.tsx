import { Send, X } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { RowAction, TileListSkeleton } from "@/components/tile-list";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AlertChannel } from "@/lib/api";

import { KIND_LABELS } from "./channel-kinds";
import { useDeliveriesQuery } from "./channels-queries";
import { DeliveryRow } from "./delivery-row";

interface DeliveryLogSheetProps {
  channel: AlertChannel;
  canWrite: boolean;
}

/**
 * Figma "Alerts — Deliveries": a right-hand sheet with the channel's recent sends, newest first,
 * a page at a time. Every member can read it; Retry needs `alerts:write`. The log loads only while
 * the sheet is open.
 */
export function DeliveryLogSheet({ channel, canWrite }: DeliveryLogSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <RowAction aria-label={`Deliveries of ${channel.name}`}>Deliveries</RowAction>
      </SheetTrigger>
      {open ? (
        <SheetContent side="right" hideClose className="w-[560px] gap-5 p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <SheetTitle className="text-h3 font-bold text-foreground">Deliveries</SheetTitle>
              <SheetDescription className="text-sm [overflow-wrap:anywhere] text-muted-foreground">
                Recent sends to {channel.name} ({KIND_LABELS[channel.kind]}), newest first.
              </SheetDescription>
            </div>
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
                className="bg-surface-muted"
              >
                <X aria-hidden />
              </Button>
            </SheetClose>
          </div>
          <DeliveryLog channelId={channel.id} canWrite={canWrite} />
        </SheetContent>
      ) : null}
    </Sheet>
  );
}

function DeliveryLog({ channelId, canWrite }: { channelId: string; canWrite: boolean }) {
  // The cursors of the pages before the current one; the last is the current page's cursor.
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1) ?? null;
  const query = useDeliveriesQuery(channelId, cursor);

  if (query.isPending) {
    return <TileListSkeleton label="Loading deliveries" rows={4} className="h-[120px]" />;
  }
  // A failed background refresh keeps the loaded page on screen.
  if (query.data === undefined) {
    return (
      <ErrorState
        compact
        error={query.error}
        title="Couldn't load deliveries"
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  if (query.data.items.length === 0 && cursor === null) {
    return (
      <EmptyState
        icon={Send}
        title="No deliveries yet."
        description="Send a test, or wait for a rule to fire. Every attempt shows up here."
        className="rounded-tile bg-surface-muted"
      />
    );
  }

  const nextCursor = query.data.next_cursor;
  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Deliveries" aria-busy={query.isFetching} className="flex flex-col gap-1.5">
        {query.data.items.map((delivery) => (
          <DeliveryRow
            key={delivery.id}
            delivery={delivery}
            channelId={channelId}
            canWrite={canWrite}
          />
        ))}
      </ul>
      <nav aria-label="Delivery pages" className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">Newest first</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={cursors.length === 0 || query.isPlaceholderData}
            onClick={() => {
              setCursors((stack) => stack.slice(0, -1));
            }}
          >
            Previous
          </Button>
          <Button
            size="sm"
            disabled={!nextCursor || query.isPlaceholderData}
            onClick={() => {
              if (nextCursor) {
                setCursors((stack) => [...stack, nextCursor]);
              }
            }}
          >
            Next
          </Button>
        </div>
      </nav>
    </div>
  );
}
