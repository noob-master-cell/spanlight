import { toast } from "sonner";

import { ValueOrUnknown } from "@/components/unknown-value";
import { Badge } from "@/components/ui/badge";
import type { ApiKey } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useRevokeApiKey } from "./api-key-queries";
import { formatKeyPrefix, isRevoked, revokeDecision, type RevokeAbility } from "./api-key-utils";
import { ConfirmDialog } from "./confirm-dialog";
import { DisabledReason } from "./disabled-reason";
import { InitialAvatar } from "./initial-avatar";
import { RelativeTime } from "./relative-time";
import { ColumnLabels, RowAction, TileList } from "./settings-list";

/*
 * Columns appear as the card gets wider (container queries, so the settings nav beside the
 * card is accounted for): name, status and action always; key and last used from 38rem;
 * created by and created from 51rem, the full Figma row.
 */
const MEDIUM = "hidden @[38rem]:block";
const WIDE = "hidden @[51rem]:block";

interface ApiKeyListProps {
  keys: ApiKey[];
  ability: RevokeAbility;
}

/** Figma "Settings/Key row" tiles under their column labels. */
export function ApiKeyList({ keys, ability }: ApiKeyListProps) {
  return (
    <div className="@container flex flex-col gap-3">
      <ColumnLabels className="pr-3 pl-4 @[38rem]:flex">
        <span className="min-w-0 flex-1">Name</span>
        <span className="w-28">Key</span>
        <span className={cn(WIDE, "w-[124px]")}>Created by</span>
        <span className={cn(WIDE, "w-24")}>Created</span>
        <span className="w-[108px]">Last used</span>
        <span className="w-[84px]">Status</span>
        <span className="w-[70px]" />
      </ColumnLabels>
      <TileList label="API keys">
        {keys.map((key) => (
          <ApiKeyRow key={key.id} apiKey={key} ability={ability} />
        ))}
      </TileList>
    </div>
  );
}

function ApiKeyRow({ apiKey, ability }: { apiKey: ApiKey; ability: RevokeAbility }) {
  const revoked = isRevoked(apiKey);
  const prefix = formatKeyPrefix(apiKey.prefix);

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-tile",
        revoked
          ? "border border-dashed border-border py-[9px] pr-[11px] pl-[15px] text-subtle-foreground"
          : "bg-surface-muted py-2.5 pr-3 pl-4 text-muted-foreground",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span
            title={apiKey.name}
            className={cn(
              "truncate text-sm font-semibold",
              revoked ? "text-subtle-foreground" : "text-foreground",
            )}
          >
            {apiKey.name}
          </span>
          <span className="flex shrink-0 @[38rem]:hidden">
            <KeyStatusBadge apiKey={apiKey} size="sm" />
          </span>
        </span>
        {/* Narrow cards: the status, key and last use move into this column. */}
        <span className="truncate font-mono text-xs @[38rem]:hidden">{prefix}</span>
        <span className="truncate text-xs font-medium @[38rem]:hidden">
          {apiKey.last_used_at === null ? (
            "Never used"
          ) : (
            <>
              Last used <RelativeTime iso={apiKey.last_used_at} />
            </>
          )}
        </span>
      </div>

      <span title={prefix} className={cn(MEDIUM, "w-28 truncate font-mono text-label")}>
        <span className="sr-only">Key </span>
        {prefix}
      </span>
      <div className={cn(WIDE, "w-[124px]")}>
        <CreatedBy apiKey={apiKey} revoked={revoked} />
      </div>
      <span className={cn(WIDE, "w-24 text-sm")}>
        <span className="sr-only">Created </span>
        <time dateTime={apiKey.created_at}>{formatDate(apiKey.created_at)}</time>
      </span>
      <span className={cn(MEDIUM, "w-[108px] text-sm whitespace-nowrap")}>
        <span className="sr-only">Last used </span>
        <LastUsed apiKey={apiKey} />
      </span>
      <div className={cn(MEDIUM, "w-[84px] shrink-0")}>
        <KeyStatusBadge apiKey={apiKey} />
      </div>
      <div className="flex h-8 shrink-0 justify-end @[38rem]:w-[70px]">
        {revoked ? null : <RevokeKeyAction apiKey={apiKey} ability={ability} />}
      </div>
    </li>
  );
}

function LastUsed({ apiKey }: { apiKey: ApiKey }) {
  if (apiKey.last_used_at === null) {
    return <span className="text-subtle-foreground">Never</span>;
  }
  return <RelativeTime iso={apiKey.last_used_at} />;
}

function CreatedBy({ apiKey, revoked }: { apiKey: ApiKey; revoked: boolean }) {
  const creator = apiKey.created_by;
  if (creator === null) {
    return (
      <ValueOrUnknown value={null} reason="The account that created this key no longer exists" />
    );
  }
  const name = creator.name || creator.email;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="sr-only">Created by </span>
      <InitialAvatar
        name={name}
        seed={creator.id}
        size="xs"
        tone={revoked ? "neutral" : undefined}
        className={revoked ? "bg-surface-muted" : undefined}
      />
      <span
        title={name}
        className={cn("truncate text-sm", revoked ? "text-subtle-foreground" : "text-foreground")}
      >
        {name}
      </span>
    </span>
  );
}

function KeyStatusBadge({ apiKey, size }: { apiKey: ApiKey; size?: "sm" | "md" }) {
  if (apiKey.revoked_at) {
    return (
      <Badge size={size}>
        Revoked
        <span className="sr-only"> on {formatDate(apiKey.revoked_at)}</span>
      </Badge>
    );
  }
  return (
    <Badge variant="success" size={size}>
      Active
    </Badge>
  );
}

function RevokeKeyAction({ apiKey, ability }: { apiKey: ApiKey; ability: RevokeAbility }) {
  const revokeKey = useRevokeApiKey();
  const decision = revokeDecision(apiKey, ability);

  if (!decision.allowed) {
    return (
      <DisabledReason reason={decision.reason}>
        <RowAction disabled>Revoke</RowAction>
      </DisabledReason>
    );
  }

  return (
    <ConfirmDialog
      trigger={<RowAction aria-label={`Revoke key ${apiKey.name}`}>Revoke</RowAction>}
      title={`Revoke key "${apiKey.name}"?`}
      description="Applications using it will immediately get 401 errors. This can't be undone."
      confirmLabel="Revoke key"
      onConfirm={async () => {
        await revokeKey.mutateAsync(apiKey.id);
        toast.success(`Revoked API key "${apiKey.name}".`);
      }}
    />
  );
}
