import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TracesListFooterProps {
  /** e.g. "Showing 50 of 12,904 traces". */
  summary: string;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  /** `card` sits inside the table card; `stacked` is the full-width phone layout. */
  layout: "card" | "stacked";
  className?: string;
}

/** The count and the cursor "Load more" button under the traces list. */
export function TracesListFooter({
  summary,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  layout,
  className,
}: TracesListFooterProps) {
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
