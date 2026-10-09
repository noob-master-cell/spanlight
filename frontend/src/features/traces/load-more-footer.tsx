import { Button } from "@/components/ui/button";
import { formatInteger } from "@/lib/format";

interface LoadMoreFooterProps {
  loadedCount: number;
  /** Plural noun for the count, e.g. "traces". */
  noun: string;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function LoadMoreFooter({
  loadedCount,
  noun,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: LoadMoreFooterProps) {
  const count = formatInteger(loadedCount) ?? String(loadedCount);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
      <p className="text-xs text-muted-foreground tabular" aria-live="polite">
        {hasNextPage ? `Showing ${count} ${noun}` : `All ${count} ${noun} loaded`}
      </p>
      {hasNextPage ? (
        <Button size="sm" onClick={onLoadMore} loading={isFetchingNextPage}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}
