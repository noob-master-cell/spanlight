import { DisabledReason } from "@/components/disabled-reason";
import { RowAction } from "@/components/tile-list";
import type { GatewayKey } from "@/lib/api";

import { EditKeySheet } from "./edit-key-sheet";
import { RevokeKeyAction } from "./revoke-key-action";

export const READ_ONLY_REASON = "Only admins and owners can change gateway keys.";

/** Edit and Revoke for one row, or the same two buttons disabled with the reason. */
export function KeyRowActions({
  gatewayKey,
  canWrite,
}: {
  gatewayKey: GatewayKey;
  canWrite: boolean;
}) {
  if (!canWrite) {
    return (
      <DisabledReason reason={READ_ONLY_REASON}>
        <span className="flex gap-1.5">
          <RowAction disabled>Edit</RowAction>
          <RowAction disabled>Revoke</RowAction>
        </span>
      </DisabledReason>
    );
  }
  return (
    <span className="flex gap-1.5">
      <EditKeySheet
        gatewayKey={gatewayKey}
        trigger={<RowAction aria-label={`Edit key ${gatewayKey.name}`}>Edit</RowAction>}
      />
      <RevokeKeyAction gatewayKey={gatewayKey} variant="row" />
    </span>
  );
}
