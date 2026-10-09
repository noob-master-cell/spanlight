import { ColumnLabels, TileList } from "@/components/tile-list";
import type { Route } from "@/lib/api";

import { ROUTE_COLUMNS } from "./route-columns";
import { RouteRow } from "./route-row";
import type { RouteLookups } from "./use-route-lookups";

interface RouteListProps {
  routes: readonly Route[];
  lookups: RouteLookups;
  canWrite: boolean;
}

/** Figma "Gateway — Routes": route tiles under overline column labels, the default first. */
export function RouteList({ routes, lookups, canWrite }: RouteListProps) {
  const ordered = [...routes].sort((a, b) => Number(b.is_default) - Number(a.is_default));
  return (
    <div className="@container flex flex-col gap-3">
      <ColumnLabels className="gap-3 pr-3 pl-4 @[40rem]:flex">
        <span className={ROUTE_COLUMNS.name}>Route</span>
        <span className={ROUTE_COLUMNS.targets}>Targets (fallback order)</span>
        <span className={ROUTE_COLUMNS.version}>Version</span>
        <span className={ROUTE_COLUMNS.updated}>Updated</span>
        <span className={ROUTE_COLUMNS.keys}>Keys</span>
        <span className={canWrite ? "w-[108px] shrink-0" : "w-[68px] shrink-0"} />
      </ColumnLabels>
      <TileList label="Routes">
        {ordered.map((route) => (
          <RouteRow
            key={route.id}
            route={route}
            nameOf={lookups.nameOf}
            keyCount={lookups.keysFor(route.id)?.length ?? null}
            canWrite={canWrite}
          />
        ))}
      </TileList>
    </div>
  );
}
