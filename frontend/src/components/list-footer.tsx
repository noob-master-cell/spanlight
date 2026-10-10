import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ListFooterProps {
  /** e.g. "Showing 50 of 12,904 traces". Announced politely as it changes. */
  summary: string;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  /** `card` sits inside the table card; `stacked` is the full-width phone layout. */
  layout: "card" | "stacked";
  className?: string;
}

/** The count and the cursor "Load more" button under a keyset-paginated list (traces, users). */
export function ListFooter({
  summary,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  layout,
  className,
}: ListFooterProps) {
  const stacked = layout === "stacked";
  return (
    <div
      className={cn(
        stacked
          ? "flex flex-col items-center gap-2.5"
          : "flex min-h-14 items-center justify-between gap-3 border-t border-border pt-3 pr-1 pb-1 pl-3",
        className,
      )}
    >
      <p className="text-xs font-medium text-muted-foreground tabular" aria-live="polite">
        {summary}
      </p>
      {hasNextPage ? (
        <Button
          onClick={onLoadMore}
          loading={isFetchingNextPage}
          className={cn(stacked && "w-full")}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}
