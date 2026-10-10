import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { errorMessage, type AlertChannel } from "@/lib/api";

import { useDeleteChannel } from "./channels-queries";

interface DeleteChannelDialogProps {
  channel: AlertChannel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Figma "Delete channel". Rules and budgets keep the id and skip the channel until they are
 * edited, so nothing else needs to change first.
 */
export function DeleteChannelDialog({ channel, open, onOpenChange }: DeleteChannelDialogProps) {
  const deleteChannel = useDeleteChannel();

  return (
    <ConfirmDialog
      control={{ open, onOpenChange }}
      title={`Delete ${channel.name}?`}
      description="Rules and budgets that send here skip it from now on. This can't be undone."
      confirmLabel="Delete channel"
      onConfirm={async () => {
        try {
          await deleteChannel.mutateAsync(channel.id);
          toast.success(`Deleted channel "${channel.name}".`);
        } catch (error) {
          toast.error(errorMessage(error));
          throw error;
        }
      }}
    />
  );
}
