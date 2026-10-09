import { FlaskConical } from "lucide-react";

import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UnknownValue } from "@/components/unknown-value";
import { formatInteger } from "@/lib/format";
import type { GatewayKey } from "@/lib/api";

import { cacheLabel } from "./key-form";

/** The cells of one key row that are more than a line of text. */

/** The violet tag for a Lab fault profile on the key. */
export function FaultTag({ name }: { name: string }) {
  return (
    <Badge variant="violet" size="sm" className="max-w-full">
      <FlaskConical aria-hidden />
      <span className="sr-only">Fault profile </span>
      <span className="truncate">{name}</span>
    </Badge>
  );
}

/** "600 rpm" over "200,000 tpm"; a limit that is not set says so (null is no limit, not zero). */
export function LimitsCell({ gatewayKey }: { gatewayKey: GatewayKey }) {
  const rpm = formatInteger(gatewayKey.rpm_limit);
  const tpm = formatInteger(gatewayKey.tpm_limit);
  return (
    <>
      <span className="block truncate">{rpm ? `${rpm} rpm` : "No rpm limit"}</span>
      <span className="block truncate text-xs">{tpm ? `${tpm} tpm` : "No tpm limit"}</span>
    </>
  );
}

export function CacheCell({ gatewayKey }: { gatewayKey: GatewayKey }) {
  return <span>{cacheLabel(gatewayKey.cache_ttl_seconds)}</span>;
}

interface RouteCellProps {
  routeId: string | null;
  /** The project's routes by id; undefined while they load. */
  routeNames: ReadonlyMap<string, string> | undefined;
}

export function RouteCell({ routeId, routeNames }: RouteCellProps) {
  if (routeId === null) {
    return <UnknownValue reason="This key's route was deleted" />;
  }
  if (routeNames === undefined) {
    return <Skeleton aria-hidden className="h-4 w-20" />;
  }
  const name = routeNames.get(routeId);
  return name ? (
    <span title={name} className="block truncate">
      {name}
    </span>
  ) : (
    <UnknownValue reason="This route's name could not be loaded" />
  );
}

export function LastUsed({ gatewayKey }: { gatewayKey: GatewayKey }) {
  if (gatewayKey.last_used_at === null) {
    return <span className="text-subtle-foreground">Never</span>;
  }
  return <RelativeTime iso={gatewayKey.last_used_at} />;
}
