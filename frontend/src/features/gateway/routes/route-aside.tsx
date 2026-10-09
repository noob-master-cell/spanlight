import { SectionCard } from "@/components/section-card";
import { UnknownValue } from "@/components/unknown-value";
import type { GatewayKey } from "@/lib/api";

import { EnvironmentBadge } from "../environment-badge";

const ROUTING_STEPS = [
  "Pick the first target by weight.",
  "Retry it on the listed statuses, up to max attempts.",
  "On a fallback condition, try the next target in order.",
  "Stop at the timeout and return the provider’s error.",
];

/**
 * The editor's side column: the gateway keys on the route (null while the key list is unknown)
 * and how a call is routed.
 */
export function RouteAside({ keys }: { keys: readonly GatewayKey[] | null }) {
  return (
    <aside aria-label="About this route" className="flex flex-col gap-4">
      <SectionCard
        title="Used by"
        description="Gateway keys that send calls through this route."
        className="gap-3"
      >
        <UsedByList keys={keys} />
      </SectionCard>
      <SectionCard title="How a call is routed" className="gap-3">
        <ol className="flex list-inside list-decimal flex-col gap-2 text-xs font-medium text-muted-foreground">
          {ROUTING_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </SectionCard>
    </aside>
  );
}

function UsedByList({ keys }: { keys: readonly GatewayKey[] | null }) {
  if (keys === null) {
    return (
      <p className="text-sm text-muted-foreground">
        <UnknownValue reason="Gateway keys couldn't be loaded." />
      </p>
    );
  }
  if (keys.length === 0) {
    return (
      <p className="text-xs font-medium text-muted-foreground">
        No keys use this route yet. Pick it when you create or edit a key.
      </p>
    );
  }
  return (
    <ul aria-label="Gateway keys on this route" className="flex flex-col gap-1.5">
      {keys.map((key) => (
        <li
          key={key.id}
          className="flex items-center justify-between gap-3 rounded-tile bg-surface-muted px-3 py-2.5"
        >
          <span title={key.name} className="truncate text-sm font-medium text-foreground">
            {key.name}
          </span>
          <EnvironmentBadge environment={key.environment} />
        </li>
      ))}
    </ul>
  );
}
