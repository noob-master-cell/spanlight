import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Fragment } from "react";

import { UnknownValue, ValueOrUnknown } from "@/components/unknown-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProjectParams } from "@/features/shell";
import type { Route } from "@/lib/api";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

import { RouteActionsMenu } from "./route-actions-menu";
import { ROUTE_COLUMNS } from "./route-columns";
import { keyCountLabel, routeSummary, userName } from "./route-summary";
import type { CredentialNamer } from "./version-diff";

interface RouteRowProps {
  route: Route;
  nameOf: CredentialNamer;
  /** Active keys on the route, or null while the key list is unknown. */
  keyCount: number | null;
  canWrite: boolean;
}

/** Figma "Gateway/Route row": name and Default badge, targets in fallback order, version, update, keys. */
export function RouteRow({ route, nameOf, keyCount, canWrite }: RouteRowProps) {
  const { orgId, projectId } = useProjectParams();
  const updated = formatTimestamp(route.updated_at);

  return (
    <li className="flex items-center gap-3 rounded-tile bg-surface-muted py-2.5 pr-3 pl-4">
      <div className={ROUTE_COLUMNS.name}>
        <span className="flex min-w-0 items-center gap-2">
          <span title={route.name} className="truncate text-sm font-semibold text-foreground">
            {route.name}
          </span>
          {route.is_default ? (
            <Badge variant="lime" size="sm">
              Default
            </Badge>
          ) : null}
        </span>
        <span className="block truncate text-xs font-medium text-muted-foreground">
          {routeSummary(route.config)}
        </span>
        {/* Narrow cards: version and keys move under the name. */}
        <span className="block text-xs font-medium text-muted-foreground @[40rem]:hidden">
          v{route.version} · <KeyCount count={keyCount} />
        </span>
      </div>
      <div className={cn(ROUTE_COLUMNS.targets, "font-mono text-label text-muted-foreground")}>
        <span className="sr-only">Targets in fallback order: </span>
        <TargetChain route={route} nameOf={nameOf} />
      </div>
      <span className={cn(ROUTE_COLUMNS.version, "text-sm font-semibold text-foreground tabular")}>
        <span className="sr-only">Version </span>v{route.version}
      </span>
      <div className={cn(ROUTE_COLUMNS.updated, "text-xs text-muted-foreground")}>
        <ValueOrUnknown
          value={updated}
          reason="The timestamp could not be read."
          className="block text-sm text-foreground tabular"
        />
        <span className="block truncate">
          by{" "}
          {route.updated_by ? (
            userName(route.updated_by)
          ) : (
            <UnknownValue reason="Saved by Spanlight or by a removed account." />
          )}
        </span>
      </div>
      <span className={cn(ROUTE_COLUMNS.keys, "text-sm text-muted-foreground")}>
        <KeyCount count={keyCount} />
      </span>
      <div className={ROUTE_COLUMNS.actions}>
        <Button variant="secondary" size="sm" className="shadow-none" asChild>
          <Link
            to="/$orgId/$projectId/gateway/routes/$routeId"
            params={{ orgId, projectId, routeId: route.id }}
            aria-label={`${canWrite ? "Edit" : "View"} ${route.name}`}
          >
            {canWrite ? "Edit" : "View"}
          </Link>
        </Button>
        {canWrite ? <RouteActionsMenu route={route} keyCount={keyCount} /> : null}
      </div>
    </li>
  );
}

function KeyCount({ count }: { count: number | null }) {
  if (count === null) {
    return <UnknownValue reason="Gateway keys couldn't be loaded." />;
  }
  return <>{keyCountLabel(count)}</>;
}

function TargetChain({ route, nameOf }: { route: Route; nameOf: CredentialNamer }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {route.config.targets.map((target, index) => {
        const name = nameOf(target.credential_id);
        return (
          <Fragment key={index}>
            {index > 0 ? (
              <>
                <ArrowRight aria-hidden className="size-3 shrink-0" />
                <span className="sr-only">then</span>
              </>
            ) : null}
            {name === null ? (
              <UnknownValue reason="This credential no longer exists or couldn't be loaded." />
            ) : (
              <span className="truncate">{name}</span>
            )}
          </Fragment>
        );
      })}
    </span>
  );
}
