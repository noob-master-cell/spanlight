import type { ApiKey } from "@/lib/api";
import { cn } from "@/lib/utils";

import { KEY_COLUMNS } from "./api-key-columns";
import { CreatedCell, KeyStatusBadge, LastUsed, RevokeKeyAction } from "./api-key-cells";
import { formatKeyPrefix, keyStatus, type RevokeAbility } from "./api-key-utils";
import { ScopeTag } from "./tokens/scope-tag";
import { ExpiresText } from "./tokens/expires-text";

interface ApiKeyRowProps {
  apiKey: ApiKey;
  ability: RevokeAbility;
}

/**
 * Figma "Settings/Key row v2": name and prefix, scopes, creation, last use, expiry, status and
 * Revoke. A revoked key is a dashed outline with no action; an expired one keeps its Revoke so it
 * can be cleaned up.
 */
export function ApiKeyRow({ apiKey, ability }: ApiKeyRowProps) {
  const status = keyStatus(apiKey);
  const revoked = status === "revoked";
  const prefix = formatKeyPrefix(apiKey.prefix);

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-tile",
        revoked
          ? "border border-dashed border-border py-[9px] pr-[11px] pl-[15px] text-subtle-foreground"
          : "bg-surface-muted py-2.5 pr-3 pl-4 text-muted-foreground",
      )}
    >
      <div className={KEY_COLUMNS.name}>
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
          <span className="flex shrink-0 @[52rem]:hidden">
            <KeyStatusBadge apiKey={apiKey} status={status} size="sm" />
          </span>
        </span>
        <span title={prefix} className="block truncate font-mono text-label">
          {prefix}
        </span>
        {/* Narrow cards: scopes, last use and expiry move under the name. */}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium @[38rem]:hidden">
          <KeyScopeTags apiKey={apiKey} />
          <span>
            Last used <LastUsed apiKey={apiKey} />
          </span>
          <span aria-hidden>·</span>
          <span>
            Expires <ExpiresText expiresAt={apiKey.expires_at} plain={revoked} />
          </span>
        </span>
      </div>
      <div className={KEY_COLUMNS.scopes}>
        <span className="sr-only">Scopes </span>
        <KeyScopeTags apiKey={apiKey} />
      </div>
      <div className={KEY_COLUMNS.created}>
        <CreatedCell apiKey={apiKey} />
      </div>
      <span className={cn(KEY_COLUMNS.lastUsed, "text-sm")}>
        <span className="sr-only">Last used </span>
        <LastUsed apiKey={apiKey} />
      </span>
      <span className={cn(KEY_COLUMNS.expires, "text-sm whitespace-nowrap")}>
        <span className="sr-only">Expires </span>
        <ExpiresText expiresAt={apiKey.expires_at} plain={revoked} />
      </span>
      <div className={KEY_COLUMNS.status}>
        <KeyStatusBadge apiKey={apiKey} status={status} />
      </div>
      <div className={KEY_COLUMNS.action}>
        {revoked ? null : <RevokeKeyAction apiKey={apiKey} ability={ability} />}
      </div>
    </li>
  );
}

function KeyScopeTags({ apiKey }: { apiKey: ApiKey }) {
  return (
    <>
      {apiKey.scopes.map((scope) => (
        <ScopeTag key={scope} scope={scope} />
      ))}
    </>
  );
}
