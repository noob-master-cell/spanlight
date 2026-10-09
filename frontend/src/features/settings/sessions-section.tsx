import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import type { AuthSession } from "@/lib/api";

import { useAuthSessionsQuery } from "./account-queries";
import { DeviceRow } from "./device-row";
import { SignOutOthersDialog } from "./sign-out-others-dialog";
import { TileList, TileListSkeleton } from "./settings-list";
import { SettingsSection } from "./settings-section";

/**
 * Devices signed in to the account. Each other device can be revoked on its own, and "Sign out of
 * all other sessions" ends them all at once while this one stays signed in.
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

  const others = query.data.filter((session) => !session.current);

  return (
    <>
      <TileList label="Active sessions">
        {sortSessions(query.data).map((session) => (
          <DeviceRow key={session.id} session={session} />
        ))}
      </TileList>
      <div className="flex flex-col gap-3 pt-1.5 pl-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Revoking a session signs that device out immediately.
        </p>
        {others.length > 0 ? (
          <SignOutOthersDialog
            sessions={others}
            trigger={<Button className="self-start">Sign out of all other sessions</Button>}
          />
        ) : null}
      </div>
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
