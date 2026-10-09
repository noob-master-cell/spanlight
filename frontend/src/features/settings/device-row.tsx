import { Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { RelativeTime } from "@/components/relative-time";
import { RowAction } from "@/components/tile-list";
import { UnknownValue } from "@/components/unknown-value";
import { Badge } from "@/components/ui/badge";
import type { AuthSession } from "@/lib/api";
import { formatDate, formatTimestamp } from "@/lib/format";

import { useRevokeAuthSession } from "./account-queries";
import { describeUserAgent } from "./user-agent";

/** Figma "Settings/Device row". */
export function DeviceRow({ session }: { session: AuthSession }) {
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
