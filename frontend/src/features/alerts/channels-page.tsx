import { BellRing, Info, Plus } from "lucide-react";
import { useId, type ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { TileListSkeleton } from "@/components/tile-list";
import { Button } from "@/components/ui/button";
import { useCurrentOrg, usePermission } from "@/features/shell";

import { AlertsLayout, AlertsReadOnlyLine } from "./alerts-layout";
import { ChannelDialog } from "./channel-dialog";
import { CHANNEL_COPY } from "./channel-kinds";
import { ChannelList } from "./channel-list";
import { useAlertChannelsQuery } from "./alerts-queries";

/**
 * Figma "Alerts — Channels" and its states (empty, loading, error, read-only, test results).
 * Channels belong to the organization: every member reads them, admins and owners add, test,
 * edit and delete them.
 */
export function AlertChannelsPage() {
  const orgName = useCurrentOrg()?.name ?? "your organization";
  const canWrite = usePermission("alerts:write");
  const readOnlyId = useId();
  const query = useAlertChannelsQuery();

  const addButton = (
    <ChannelDialog
      channel={null}
      trigger={
        <Button
          variant="primary"
          disabled={!canWrite}
          aria-describedby={canWrite ? undefined : readOnlyId}
        >
          <Plus aria-hidden />
          Add channel
        </Button>
      }
    />
  );

  return (
    <AlertsLayout>
      <SectionCard
        title="Channels"
        description={`Shared by every project in ${orgName}. Test a channel to check it works.`}
        className="gap-4"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-3">
            {canWrite ? null : (
              <div id={readOnlyId}>
                <AlertsReadOnlyLine />
              </div>
            )}
            {addButton}
          </div>
        }
      >
        <ChannelsContent
          query={query}
          canWrite={canWrite}
          readOnlyId={readOnlyId}
          addButton={addButton}
        />
        <p className="flex items-center gap-2 px-1 pt-2 text-xs font-medium text-muted-foreground">
          <Info aria-hidden className="size-3.5 shrink-0" />
          {CHANNEL_COPY.footnote}
        </p>
      </SectionCard>
    </AlertsLayout>
  );
}

interface ChannelsContentProps {
  query: ReturnType<typeof useAlertChannelsQuery>;
  canWrite: boolean;
  readOnlyId: string;
  addButton: ReactNode;
}

function ChannelsContent({ query, canWrite, readOnlyId, addButton }: ChannelsContentProps) {
  if (query.isPending) {
    return <TileListSkeleton label="Loading channels" rows={4} className="h-[56px]" />;
  }
  // A failed background refresh keeps the loaded list on screen.
  if (query.data === undefined) {
    return (
      <ErrorState
        compact
        error={query.error}
        title="Couldn't load channels"
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  if (query.data.length === 0) {
    return (
      <EmptyState
        icon={BellRing}
        title="No channels"
        description="Channels are where alerts go: email, Slack, a signed webhook or PagerDuty."
        action={canWrite ? addButton : undefined}
        className="rounded-tile bg-surface-muted"
      />
    );
  }
  return <ChannelList channels={query.data} canWrite={canWrite} readOnlyId={readOnlyId} />;
}
