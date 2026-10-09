import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { RelativeTime } from "@/components/relative-time";
import { RowAction } from "@/components/tile-list";
import { Badge } from "@/components/ui/badge";
import { UnknownValue } from "@/components/unknown-value";
import type { PersonalAccessToken } from "@/lib/api";
import { formatDate } from "@/lib/format";

import { REVOKE_DESCRIPTION } from "../revoke-copy";
import { expiryState } from "./expiry";
import { ExpiresText } from "./expires-text";
import { ScopeTag } from "./scope-tag";
import { TOKEN_COLUMNS } from "./token-columns";
import { useRevokeToken } from "./token-queries";

interface TokenRowProps {
  token: PersonalAccessToken;
}

/** Figma "Settings/Token row": name and prefix, scope, dates, status and Revoke. */
export function TokenRow({ token }: TokenRowProps) {
  return (
    <li className="flex items-center gap-3 rounded-tile bg-surface-muted py-2.5 pr-3 pl-4 text-muted-foreground">
      <div className={TOKEN_COLUMNS.name}>
        <span className="flex min-w-0 items-center gap-2">
          <span title={token.name} className="truncate text-sm font-semibold text-foreground">
            {token.name}
          </span>
          <span className="flex shrink-0 @[52rem]:hidden">
            <TokenStatusBadge token={token} size="sm" />
          </span>
        </span>
        <span title={token.prefix} className="block truncate font-mono text-label">
          {token.prefix}
        </span>
        {/* Narrow cards: scope, last use and expiry move under the name. */}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium @[38rem]:hidden">
          <ScopeTag scope={token.scope} />
          <span aria-hidden>·</span>
          <LastUsed token={token} withLabel />
          <span aria-hidden>·</span>
          <span>
            Expires <ExpiresText expiresAt={token.expires_at} />
          </span>
        </span>
      </div>
      <div className={TOKEN_COLUMNS.scope}>
        <span className="sr-only">Scope </span>
        <ScopeTag scope={token.scope} />
      </div>
      <span className={`${TOKEN_COLUMNS.created} text-sm`}>
        <span className="sr-only">Created </span>
        <time dateTime={token.created_at}>{formatDate(token.created_at)}</time>
      </span>
      <span className={`${TOKEN_COLUMNS.lastUsed} text-sm whitespace-nowrap`}>
        <span className="sr-only">Last used </span>
        <LastUsed token={token} />
      </span>
      <span className={`${TOKEN_COLUMNS.expires} text-sm whitespace-nowrap`}>
        <span className="sr-only">Expires </span>
        <ExpiresText expiresAt={token.expires_at} />
      </span>
      <div className={TOKEN_COLUMNS.status}>
        <TokenStatusBadge token={token} />
      </div>
      <div className={TOKEN_COLUMNS.action}>
        <RevokeTokenAction token={token} />
      </div>
    </li>
  );
}

/** A token that has never been used has no last-use time: the dash says so, with the reason. */
function LastUsed({
  token,
  withLabel = false,
}: {
  token: PersonalAccessToken;
  withLabel?: boolean;
}) {
  const used =
    token.last_used_at === null ? (
      <UnknownValue reason="This token hasn't been used yet" />
    ) : (
      <RelativeTime iso={token.last_used_at} />
    );
  return withLabel ? <span>Last used {used}</span> : used;
}

function TokenStatusBadge({ token, size }: { token: PersonalAccessToken; size?: "sm" | "md" }) {
  if (expiryState(token.expires_at) === "expired") {
    return (
      <Badge variant="warning" size={size}>
        Expired
      </Badge>
    );
  }
  return (
    <Badge variant="success" size={size}>
      Active
    </Badge>
  );
}

function RevokeTokenAction({ token }: { token: PersonalAccessToken }) {
  const revoke = useRevokeToken();

  return (
    <ConfirmDialog
      trigger={<RowAction aria-label={`Revoke token ${token.name}`}>Revoke</RowAction>}
      title={`Revoke ${token.name}?`}
      description={REVOKE_DESCRIPTION}
      confirmLabel="Revoke"
      onConfirm={async () => {
        await revoke.mutateAsync(token.id);
        toast.success(`Revoked token "${token.name}".`);
      }}
    />
  );
}
