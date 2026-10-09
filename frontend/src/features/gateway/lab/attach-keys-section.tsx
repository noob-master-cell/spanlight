import { Check, Lock } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { useId } from "react";

import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { FaultProfile, GatewayKey } from "@/lib/api";
import { cn } from "@/lib/utils";

import { isProductionEnvironment } from "../environment";
import { useFaultProfilesQuery, useGatewayKeysQuery } from "../gateway-queries";
import { attachableKeys, PRODUCTION_KEY_REASON } from "./lab-profile";

interface AttachKeysSectionProps {
  /** The profile being edited, or null for a new one. Its own keys are never "replaced". */
  profileId: string | null;
  selected: ReadonlySet<string>;
  /** Why the last save could not update a key, by key id. */
  errors: Readonly<Record<string, string>>;
  onToggle: (keyId: string, checked: boolean) => void;
}

/**
 * Figma "Attach to keys": every live key as a checkbox card. Production keys are listed but
 * disabled, with the reason as text, not only in a tooltip. A key runs one profile, so ticking a
 * key that runs another one says it replaces it.
 */
export function AttachKeysSection({
  profileId,
  selected,
  errors,
  onToggle,
}: AttachKeysSectionProps) {
  const labelId = useId();
  const keys = useGatewayKeysQuery();
  const profiles = useFaultProfilesQuery();

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span id={labelId} className="text-label leading-5 font-semibold text-foreground">
          Attach to keys
        </span>
        <p className="text-xs font-medium text-muted-foreground">
          A key runs at most one fault profile. Attaching here replaces its current one.
        </p>
      </div>
      <KeyChoices
        keys={keys.data ? attachableKeys(keys.data) : null}
        profiles={profiles.data ?? []}
        pending={keys.isPending}
        error={keys.error}
        onRetry={() => void keys.refetch()}
        profileId={profileId}
        selected={selected}
        errors={errors}
        onToggle={onToggle}
      />
    </div>
  );
}

interface KeyChoicesProps extends AttachKeysSectionProps {
  keys: GatewayKey[] | null;
  profiles: readonly FaultProfile[];
  pending: boolean;
  error: unknown;
  onRetry: () => void;
}

function KeyChoices({
  keys,
  profiles,
  pending,
  error,
  onRetry,
  profileId,
  selected,
  errors,
  onToggle,
}: KeyChoicesProps) {
  if (pending) {
    return (
      <div role="status" aria-label="Loading keys" className="flex flex-col gap-2">
        <Skeleton className="h-[62px] rounded-input" />
        <Skeleton className="h-[62px] rounded-input" />
      </div>
    );
  }
  if (keys === null) {
    return (
      <ErrorState compact error={error} title="Couldn't load gateway keys" onRetry={onRetry} />
    );
  }
  if (keys.length === 0) {
    return (
      <p className="rounded-input bg-surface-muted p-4 text-sm text-muted-foreground">
        No gateway keys yet. Create a staging or development key, then attach a profile.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {keys.map((key) => {
        const current = profiles.find((profile) => profile.id === key.fault_profile_id);
        const replaces = current && current.id !== profileId ? current.name : null;
        return (
          <li key={key.id}>
            <KeyChoice
              gatewayKey={key}
              checked={selected.has(key.id)}
              runs={current?.name ?? null}
              replaces={replaces}
              error={errors[key.id] ?? null}
              onCheckedChange={(checked) => {
                onToggle(key.id, checked);
              }}
            />
          </li>
        );
      })}
    </ul>
  );
}

interface KeyChoiceProps {
  gatewayKey: GatewayKey;
  checked: boolean;
  /** The profile the key runs now, if any. */
  runs: string | null;
  /** Set when ticking this key would replace another profile. */
  replaces: string | null;
  /** Why the last save could not update this key. */
  error: string | null;
  onCheckedChange: (checked: boolean) => void;
}

function KeyChoice({
  gatewayKey,
  checked,
  runs,
  replaces,
  error,
  onCheckedChange,
}: KeyChoiceProps) {
  const descriptionId = useId();
  const production = isProductionEnvironment(gatewayKey.environment);

  if (production) {
    return (
      <div className="flex items-center gap-3 rounded-input bg-surface-muted p-3.5">
        <Lock aria-hidden className="size-[18px] shrink-0 text-subtle-foreground" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-muted-foreground">
            {gatewayKey.name}
          </span>
          <span className="text-xs font-medium text-muted-foreground">{PRODUCTION_KEY_REASON}</span>
        </span>
        <Badge variant="ink" size="sm">
          {gatewayKey.environment}
        </Badge>
      </div>
    );
  }

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-input transition-colors",
        checked
          ? "border-[1.5px] border-accent bg-surface-selected p-[13.5px]"
          : "border border-border-strong bg-surface p-3.5 hover:bg-surface-muted",
      )}
    >
      <span className="flex h-[21px] w-[18px] shrink-0 items-center justify-center">
        <CheckboxPrimitive.Root
          checked={checked}
          onCheckedChange={(next) => {
            onCheckedChange(next === true);
          }}
          aria-describedby={descriptionId}
          className="flex size-[18px] items-center justify-center rounded-checkbox border-[1.5px] border-subtle-foreground bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent"
        >
          <CheckboxPrimitive.Indicator>
            <Check aria-hidden className="size-3 text-accent-foreground" strokeWidth={3} />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-semibold text-foreground">{gatewayKey.name}</span>
        <span id={descriptionId} className="text-xs font-medium text-muted-foreground">
          {gatewayKey.environment}
          {runs ? ` · runs ${runs}` : ""}
          {checked && replaces ? (
            <span className="block font-semibold text-warning">
              Replaces {replaces} on this key.
            </span>
          ) : null}
          {error ? (
            <span role="alert" className="block font-semibold text-danger-text">
              {error}
            </span>
          ) : null}
        </span>
      </span>
    </label>
  );
}
