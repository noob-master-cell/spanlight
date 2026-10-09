import { Download, ShieldCheck } from "lucide-react";

import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePermission } from "@/features/shell";

import { AuditFilterBar } from "./audit-filter-bar";
import { AuditLogContent } from "./audit-log-content";
import { useAuditLogQuery } from "./audit-queries";
import { DisabledReason } from "./disabled-reason";
import { SettingsSection } from "./settings-section";
import { useAuditCsv } from "./use-audit-csv";
import { useAuditFilters } from "./use-audit-filters";

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

  return <AuditLogCard />;
}

/** The audit log with its filters. The list and the CSV download are asked for the same ones. */
function AuditLogCard() {
  const { values, filters, hasFilters, setFilters, clearFilters } = useAuditFilters();
  const query = useAuditLogQuery(filters);
  const csv = useAuditCsv(filters);

  const isEmpty = query.isSuccess && query.data.pages[0]?.items.length === 0;
  const noMatch = hasFilters && isEmpty;
  // Nothing to download while the answer is an error or empty; while loading it stays available.
  let downloadBlocked: string | null = null;
  if (query.isError && !query.isFetchNextPageError) {
    downloadBlocked = "Download is available once the audit log loads.";
  } else if (isEmpty) {
    downloadBlocked = "There are no events to download.";
  }

  return (
    <SettingsSection
      title="Audit log"
      description="Security-relevant changes in this organization: keys, members, invites and project settings. Newest first."
      actions={
        <DownloadCsvButton
          blockedReason={downloadBlocked}
          loading={csv.isPending}
          onDownload={csv.download}
        />
      }
      className="gap-3"
    >
      <AuditFilterBar
        values={values}
        onChange={setFilters}
        showClear={hasFilters && !noMatch}
        onClear={clearFilters}
      />
      {csv.tooLarge ? (
        <Callout tone="warning" role="alert" title="Too many events to download">
          This CSV would have more than 50,000 events. Narrow the date range and download again.
        </Callout>
      ) : null}
      <AuditLogContent query={query} filtered={hasFilters} onClearFilters={clearFilters} />
    </SettingsSection>
  );
}

interface DownloadCsvButtonProps {
  /** Why the button is off, or null when it can be used. */
  blockedReason: string | null;
  loading: boolean;
  onDownload: () => void;
}

function DownloadCsvButton({ blockedReason, loading, onDownload }: DownloadCsvButtonProps) {
  const button = (
    <Button
      variant="secondary"
      className="pr-4 pl-3.5 [&_svg]:size-4"
      disabled={blockedReason !== null}
      loading={loading}
      onClick={onDownload}
    >
      {loading ? null : <Download aria-hidden />}
      Download CSV
    </Button>
  );
  return blockedReason === null ? (
    button
  ) : (
    <DisabledReason reason={blockedReason}>{button}</DisabledReason>
  );
}
