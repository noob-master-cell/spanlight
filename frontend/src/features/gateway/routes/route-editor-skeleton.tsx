import { Skeleton } from "@/components/ui/skeleton";

/** Figma "Gateway — Route editor — loading": the header and cards as shimmering blocks. */
export function RouteEditorSkeleton() {
  return (
    <div role="status" aria-label="Loading route" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-72 rounded-card" />
          <Skeleton className="h-56 rounded-card" />
        </div>
        <Skeleton className="h-48 rounded-card" />
      </div>
    </div>
  );
}
