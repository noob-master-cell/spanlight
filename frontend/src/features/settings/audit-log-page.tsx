import { ScrollText, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePermission } from "@/features/shell/project-context";
import { formatInteger } from "@/lib/format";

import { AuditLogList } from "./audit-log-list";
import { useAuditLogQuery } from "./audit-queries";
import { TileListSkeleton } from "./settings-list";
import { SettingsSection } from "./settings-section";

export function AuditLogPage() {
  const canRead = usePermission("audit:read");

  if (!canRead) {
    return (
      <Card>
        <EmptyState
          icon={ShieldCheck}
          title="Audit log is restricted"
          description="Only admins and owners can view the audit log. Ask one of them if you need to review activity in this organization."
        />
      </Card>
    );
  }

  return (
    <SettingsSection
      title="Audit log"
      description="Security-relevant changes in this organization: keys, members, invites and project settings. Newest first."
      className="gap-3.5"
    >
      <AuditLogContent />
    </SettingsSection>
  );
}

function AuditLogContent() {
  const auditQuery = useAuditLogQuery(true);

  if (auditQuery.isPending) {
    return <TileListSkeleton label="Loading audit log" rows={6} className="h-[59px]" />;
  }

  if (auditQuery.isError && !auditQuery.isFetchNextPageError) {
    return (
      <ErrorState
        compact
        error={auditQuery.error}
        title="Couldn't load the audit log"
        onRetry={() => {
          void auditQuery.refetch();
        }}
      />
    );
  }

  const events = auditQuery.data.pages.flatMap((page) => page.items);

  if (events.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="No activity yet"
        description="Creating keys, inviting people and changing settings will show up here."
      />
    );
  }

  const count = formatInteger(events.length) ?? String(events.length);

  return (
    <>
      <AuditLogList events={events} />
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        {auditQuery.isFetchNextPageError ? (
          <p role="alert" className="text-sm text-danger-text">
            Couldn&apos;t load more events. Try again.
          </p>
        ) : null}
        {auditQuery.hasNextPage ? (
          <Button
            loading={auditQuery.isFetchingNextPage}
            onClick={() => {
              void auditQuery.fetchNextPage();
            }}
          >
            Load more
          </Button>
        ) : null}
        <p className="text-xs font-medium text-subtle-foreground" aria-live="polite">
          {auditQuery.hasNextPage
            ? `Showing the ${count} most recent ${events.length === 1 ? "event" : "events"}`
            : `Showing all ${count} ${events.length === 1 ? "event" : "events"}. You've reached the beginning of the audit log.`}
        </p>
      </div>
    </>
  );
}
