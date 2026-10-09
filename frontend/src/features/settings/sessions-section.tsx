import { Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { ErrorState } from "@/components/error-state";
import { UnknownValue } from "@/components/unknown-value";
import { Badge } from "@/components/ui/badge";
import type { AuthSession } from "@/lib/api";
import { formatDate, formatTimestamp } from "@/lib/format";

import { useAuthSessionsQuery, useRevokeAuthSession } from "./account-queries";
import { ConfirmDialog } from "./confirm-dialog";
import { RelativeTime } from "./relative-time";
import { RowAction, TileList, TileListSkeleton } from "./settings-list";
import { SettingsSection } from "./settings-section";
import { describeUserAgent } from "./user-agent";

/**
 * Devices signed in to the account. The design's "Sign out of all other sessions" button is
 * left out: the API can only revoke one session at a time, so each device has its own Revoke.
 */
export function SessionsSection() {
  const sessionsQuery = useAuthSessionsQuery();

  return (
    <SettingsSection
      title="Active sessions"
      description="Devices signed in to your account. Revoke any session you don't recognise."
      className="gap-3"
    >
      <SessionsContent query={sessionsQuery} />
    </SettingsSection>
  );
}

function SessionsContent({ query }: { query: ReturnType<typeof useAuthSessionsQuery> }) {
  if (query.isPending) {
    return <TileListSkeleton label="Loading sessions" rows={2} className="h-[68px]" />;
  }

  if (query.isError) {
    return (
      <ErrorState
        compact
        error={query.error}
        title="Couldn't load your sessions"
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }

  return (
    <>
      <TileList label="Active sessions">
        {sortSessions(query.data).map((session) => (
          <DeviceRow key={session.id} session={session} />
        ))}
      </TileList>
      <p className="pt-1.5 pl-1 text-xs font-medium text-muted-foreground">
        Revoking a session signs that device out immediately.
      </p>
    </>
  );
}

/** The current device first, then the most recently active. */
function sortSessions(sessions: readonly AuthSession[]): AuthSession[] {
  return [...sessions].sort((a, b) => {
    if (a.current !== b.current) {
      return a.current ? -1 : 1;
    }
    return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
  });
}

/** Figma "Settings/Device row". */
function DeviceRow({ session }: { session: AuthSession }) {
  const revokeSession = useRevokeAuthSession();
  const device = describeUserAgent(session.user_agent);
  const DeviceIcon = device.mobile ? Smartphone : Monitor;

  return (
    <li className="flex items-center gap-3.5 rounded-tile bg-surface-muted p-3">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface"
      >
        <DeviceIcon className="size-[18px] text-foreground" strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-sm font-semibold text-foreground"
            title={session.user_agent ?? undefined}
          >
            {device.label}
          </span>
          {session.current ? <Badge variant="accent">This device</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-muted-foreground">
          {session.ip ? (
            <span className="font-mono text-label">
              <span className="sr-only">IP address </span>
              {session.ip}
            </span>
          ) : (
            <UnknownValue reason="IP address not recorded" />
          )}
          <span aria-hidden className="text-subtle-foreground">
            ·
          </span>
          {session.current ? (
            <span>Active now</span>
          ) : (
            <span>
              Last active <RelativeTime iso={session.last_seen_at} />
            </span>
          )}
          <span aria-hidden className="hidden text-subtle-foreground sm:inline">
            ·
          </span>
          <span
            className="hidden sm:inline"
            title={formatTimestamp(session.created_at) ?? undefined}
          >
            Signed in <time dateTime={session.created_at}>{formatDate(session.created_at)}</time>
          </span>
        </div>
      </div>
      {session.current ? null : (
        <ConfirmDialog
          trigger={<RowAction aria-label={`Revoke session on ${device.label}`}>Revoke</RowAction>}
          title="Revoke this session?"
          description={`${device.label} will be signed out immediately and will need to sign in again.`}
          confirmLabel="Revoke session"
          onConfirm={async () => {
            await revokeSession.mutateAsync(session.id);
            toast.success(`Signed out ${device.label}.`);
          }}
        />
      )}
    </li>
  );
}
