import { useMemo } from "react";

import { TileList } from "@/components/tile-list";
import { Skeleton } from "@/components/ui/skeleton";
import type { FaultProfile, GatewayKey, Route } from "@/lib/api";

import { KeyColumnLabels, KeyRow } from "./key-row";
import { sortKeys } from "./key-order";

interface KeyListProps {
  keys: GatewayKey[];
  canWrite: boolean;
  routes: Route[] | undefined;
  profiles: FaultProfile[] | undefined;
}

/** Figma "Gateway/Key row" tiles under their column labels. The container query drives the columns. */
export function KeyList({ keys, canWrite, routes, profiles }: KeyListProps) {
  const routeNames = useMemo(
    () => (routes ? new Map(routes.map((route) => [route.id, route.name])) : undefined),
    [routes],
  );
  const profileNames = useMemo(
    () => (profiles ? new Map(profiles.map((profile) => [profile.id, profile.name])) : undefined),
    [profiles],
  );

  return (
    <div className="@container flex flex-col gap-3">
      <KeyColumnLabels />
      <TileList label="Gateway keys">
        {sortKeys(keys).map((gatewayKey) => (
          <KeyRow
            key={gatewayKey.id}
            gatewayKey={gatewayKey}
            canWrite={canWrite}
            routeNames={routeNames}
            profileNames={profileNames}
          />
        ))}
      </TileList>
    </div>
  );
}

/** Rows shaped like the key tiles, while the list loads (Figma "Keys — loading"). */
export function KeyListSkeleton() {
  return (
    <div role="status" aria-label="Loading gateway keys" className="flex flex-col gap-1.5">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-[68px] rounded-tile" />
      ))}
    </div>
  );
}
