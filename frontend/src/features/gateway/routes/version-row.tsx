import { Badge } from "@/components/ui/badge";
import type { RouteVersion } from "@/lib/api";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

import { userName } from "./route-summary";
import { versionSummary, type CredentialNamer } from "./version-diff";

interface VersionRowProps {
  version: RouteVersion;
  /** Every version, newest first: the summary compares with the one before. */
  versions: readonly RouteVersion[];
  nameOf: CredentialNamer;
  selected: boolean;
  onSelect: () => void;
}

/** Figma "Gateway/Version row": number, Current badge, author and time, what it changed. */
export function VersionRow({ version, versions, nameOf, selected, onSelect }: VersionRowProps) {
  const isCurrent = versions[0]?.version === version.version;

  return (
    <li>
      <button
        type="button"
        aria-pressed={isCurrent ? undefined : selected}
        aria-current={isCurrent ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-tile px-4 py-3 text-left transition-colors",
          selected
            ? "border-[1.5px] border-accent bg-surface-selected px-[14.5px] py-[10.5px]"
            : "bg-surface-muted hover:bg-surface-hover",
        )}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          Version {version.version}
          {isCurrent ? (
            <Badge variant="accent" size="sm">
              Current
            </Badge>
          ) : null}
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {/* Plain text: a tooltip trigger can't sit inside this button. */}
          {version.updated_by ? userName(version.updated_by) : "Deleted account"} ·{" "}
          {formatTimestamp(version.created_at) ?? "—"}
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {versionSummary(version, versions, nameOf)}
        </span>
      </button>
    </li>
  );
}
