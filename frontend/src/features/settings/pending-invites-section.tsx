import { toast } from "sonner";

import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import type { PendingInvite } from "@/lib/api";
import { formatTimestamp } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";

import { ConfirmDialog } from "./confirm-dialog";
import { useInvitesQuery, useRevokeInvite } from "./member-queries";
import { inviteExpiryLabel } from "./member-utils";
import { RelativeTime } from "./relative-time";
import { RowAction, TileList, TileListSkeleton } from "./settings-list";
import { SettingsSection } from "./settings-section";

export function PendingInvitesSection() {
  const invitesQuery = useInvitesQuery(true);

  return (
    <SettingsSection
      title="Pending invites"
      description="Links that haven't been used yet. Revoke a link to stop it from working."
      className="gap-3"
    >
      <PendingInvitesContent query={invitesQuery} />
    </SettingsSection>
  );
}

function PendingInvitesContent({ query }: { query: ReturnType<typeof useInvitesQuery> }) {
  if (query.isPending) {
    return <TileListSkeleton label="Loading pending invites" rows={2} />;
  }

  if (query.isError) {
    return (
      <ErrorState
        compact
        error={query.error}
        title="Couldn't load pending invites"
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }

  if (query.data.length === 0) {
    return (
      <p className="rounded-tile border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        No pending invites.
      </p>
    );
  }

  return (
    <TileList label="Pending invites">
      {query.data.map((invite) => (
        <PendingInviteRow key={invite.id} invite={invite} />
      ))}
    </TileList>
  );
}

/** Figma "Settings/Invite row". */
function PendingInviteRow({ invite }: { invite: PendingInvite }) {
  const revokeInvite = useRevokeInvite();
  const roleLabel = ROLE_LABELS[invite.role];

  return (
    <li className="flex items-center gap-3.5 rounded-tile bg-surface-muted py-2.5 pr-3 pl-3.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3.5 gap-y-1">
        <span className="flex w-[72px] shrink-0">
          <Badge variant="accent">{roleLabel}</Badge>
        </span>
        <span
          className="text-sm font-medium text-foreground"
          title={formatTimestamp(invite.expires_at) ?? undefined}
        >
          {inviteExpiryLabel(invite.expires_at)}
        </span>
        <span className="text-xs font-medium text-subtle-foreground">
          Created <RelativeTime iso={invite.created_at} />
        </span>
      </div>
      <ConfirmDialog
        trigger={
          <RowAction aria-label={`Revoke ${roleLabel.toLowerCase()} invite`}>Revoke</RowAction>
        }
        title="Revoke this invite link?"
        description="Anyone who has the link won't be able to join with it. You can create a new link at any time."
        confirmLabel="Revoke invite"
        onConfirm={async () => {
          await revokeInvite.mutateAsync(invite.id);
          toast.success("Invite link revoked.");
        }}
      />
    </li>
  );
}
