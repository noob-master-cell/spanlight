import { FileText, Info } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { exportsOf, type useExportsQuery } from "./export-queries";
import { ExportColumnLabels, ExportRow } from "./export-row";
import { ExportTile } from "./export-tile";

type ExportsQuery = ReturnType<typeof useExportsQuery>;

interface ExportsListProps {
  query: ExportsQuery;
  /** The button under "No exports yet", e.g. a link to the Traces page. */
  emptyAction: ReactNode;
}

/**
 * The project's exports as rows (tiles on a narrow card), with the loading, empty and error
 * states Figma draws as muted panels inside the card. The caller owns the query so it can tell
 * when the list is empty and adjust its own header.
 */
export function ExportsList({ query, emptyAction }: ExportsListProps) {
  if (query.isPending) {
    return <ExportsSkeleton />;
  }

  if (query.isError && query.data === undefined) {
    return (
      <StatePanel>
        <ErrorState
          compact
          error={query.error}
          title="Couldn't load exports"
          onRetry={() => {
            void query.refetch();
          }}
        />
      </StatePanel>
    );
  }

  const entries = exportsOf(query.data);

  if (entries.length === 0) {
    return (
      <StatePanel>
        <EmptyState
          icon={FileText}
          title="No exports yet"
          description="Start one from the Traces page."
          action={emptyAction}
        />
      </StatePanel>
    );
  }

  return (
    <div className="@container flex flex-col gap-3">
      <ExportColumnLabels />
      <ul aria-label="Exports" className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <li key={entry.id}>
            <ExportRow entry={entry} />
            <ExportTile entry={entry} />
          </li>
        ))}
      </ul>
      {query.hasNextPage || query.isFetchNextPageError ? <LoadMore query={query} /> : null}
      <p className="flex items-start gap-2 px-1 pt-1.5 text-xs font-medium text-muted-foreground">
        <Info aria-hidden className="mt-px size-3.5 shrink-0 text-subtle-foreground" />
        <span>
          Download links last 1 hour, so each click fetches a fresh one. Files are deleted 7 days
          after an export finishes.
        </span>
      </p>
    </div>
  );
}

/** The muted rounded panel Figma puts empty and error states in, inside the card. */
function StatePanel({ children }: { children: ReactNode }) {
  return <div className="rounded-tile bg-surface-muted">{children}</div>;
}

function LoadMore({ query }: { query: ExportsQuery }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {query.isFetchNextPageError ? (
        <p role="alert" className="text-sm text-danger-text">
          Couldn&apos;t load more exports. Try again.
        </p>
      ) : null}
      <Button
        loading={query.isFetchingNextPage}
        onClick={() => {
          void query.fetchNextPage();
        }}
      >
        Load more
      </Button>
    </div>
  );
}

/** Shimmering rows shaped like the final ones, under the real column labels. */
function ExportsSkeleton() {
  return (
    <div role="status" aria-label="Loading exports" className="@container flex flex-col gap-3">
      <ExportColumnLabels />
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-tile @[50rem]:h-[62px]" />
        ))}
      </div>
    </div>
  );
}
