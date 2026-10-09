import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowAction } from "@/components/tile-list";
import { Button } from "@/components/ui/button";
import type { GatewayKey } from "@/lib/api";

import { useRevokeGatewayKey } from "./keys-queries";

export const REVOKE_BODY =
  "Apps using this key start getting 401 errors right away. This can't be undone.";

interface RevokeKeyActionProps {
  gatewayKey: GatewayKey;
  /** The trigger button; the row uses a small pill, the edit sheet's danger zone a larger one. */
  variant: "row" | "danger-zone";
  /** Runs after the key is revoked, e.g. to close the edit sheet. */
  onRevoked?: () => void;
}

/** The Figma "Revoke key" dialog: the §9.1 sentence split into a title and a body. */
export function RevokeKeyAction({ gatewayKey, variant, onRevoked }: RevokeKeyActionProps) {
  const revoke = useRevokeGatewayKey();
  const trigger =
    variant === "row" ? (
      <RowAction aria-label={`Revoke key ${gatewayKey.name}`}>Revoke</RowAction>
    ) : (
      <Button
        variant="secondary"
        size="sm"
        className="border-danger text-danger-text shadow-none hover:bg-danger-subtle"
      >
        Revoke key
      </Button>
    );

  return (
    <ConfirmDialog
      trigger={trigger}
      title={`Revoke ${gatewayKey.name}?`}
      description={REVOKE_BODY}
      confirmLabel="Revoke key"
      onConfirm={async () => {
        await revoke.mutateAsync(gatewayKey.id);
        toast.success(`Revoked gateway key "${gatewayKey.name}".`);
        onRevoked?.();
      }}
    />
  );
}
