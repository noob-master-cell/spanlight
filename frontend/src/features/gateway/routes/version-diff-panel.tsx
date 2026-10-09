import type { RouteVersion } from "@/lib/api";
import { cn } from "@/lib/utils";

import { diffConfigs, type CredentialNamer } from "./version-diff";

interface VersionDiffPanelProps {
  selected: RouteVersion;
  current: RouteVersion;
  nameOf: CredentialNamer;
}

/**
 * The history drawer's comparison (Figma "Version 5 compared with the current version"): each
 * changed field by its friendly name with the raw config path beside it, the selected version's
 * value (what a revert restores) on the left and the current one on the right.
 */
export function VersionDiffPanel({ selected, current, nameOf }: VersionDiffPanelProps) {
  const changes = diffConfigs(selected.config, current.config, nameOf);

  return (
    <section
      aria-label={`Version ${selected.version} compared with the current version`}
      className="flex flex-col gap-3 rounded-tile border border-border p-4"
    >
      <p className="text-sm font-medium text-foreground">
        Version {selected.version} compared with the current version ({current.version})
      </p>
      {changes.length === 0 ? (
        <p className="text-xs font-medium text-muted-foreground">
          Same settings as the current version.
        </p>
      ) : (
        <>
          <div
            aria-hidden
            className="grid grid-cols-2 gap-3 text-overline text-subtle-foreground uppercase"
          >
            <span>Version {selected.version} · revert restores</span>
            <span>Current ({current.version})</span>
          </div>
          <dl className="flex flex-col gap-3">
            {changes.map((change) => (
              <div key={change.path} className="flex flex-col gap-1.5">
                <dt className="flex flex-wrap items-baseline gap-x-2 text-xs font-medium text-foreground">
                  {change.label}
                  <span className="font-mono text-2xs text-subtle-foreground">{change.path}</span>
                </dt>
                <dd className="grid grid-cols-2 gap-3 text-xs">
                  <DiffValue
                    label={`Version ${selected.version}`}
                    value={change.before}
                    tone="selected"
                  />
                  <DiffValue label="Current" value={change.after} tone="current" />
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

interface DiffValueProps {
  label: string;
  value: string | null;
  tone: "selected" | "current";
}

function DiffValue({ label, value, tone }: DiffValueProps) {
  return (
    <span
      className={cn(
        "rounded-input px-2.5 py-1.5 [overflow-wrap:anywhere]",
        tone === "selected"
          ? "bg-accent-subtle text-foreground"
          : "bg-surface-muted text-foreground",
      )}
    >
      <span className="sr-only">{label}: </span>
      {value ?? <span className="text-subtle-foreground">Not in this version</span>}
    </span>
  );
}
