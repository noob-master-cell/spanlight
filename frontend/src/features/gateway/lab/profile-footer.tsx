import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { errorMessage, type FaultProfile } from "@/lib/api";

import { useDeleteFaultProfile } from "./lab-queries";

interface ProfileFooterProps {
  /** The saved profile; Delete shows once there is one. */
  profile: FaultProfile | undefined;
  saving: boolean;
  /** Any request is running: Cancel and Delete wait for it. */
  pending: boolean;
  onDeleted: () => void;
}

/** Cancel and the save button, with Delete profile on the left once the profile exists. */
export function ProfileFooter({ profile, saving, pending, onDeleted }: ProfileFooterProps) {
  const remove = useDeleteFaultProfile();

  return (
    <DialogFooter className="flex-row flex-wrap justify-end gap-2.5 max-sm:[&>*]:flex-1">
      {profile ? (
        <ConfirmDialog
          trigger={
            <Button disabled={pending} className="border-danger/40 text-danger-text sm:mr-auto">
              Delete profile
            </Button>
          }
          title={`Delete ${profile.name}?`}
          description="Keys that run it stop injecting faults. This can't be undone."
          confirmLabel="Delete profile"
          onConfirm={async () => {
            try {
              await remove.mutateAsync(profile.id);
            } catch (error) {
              toast.error(errorMessage(error));
              throw error;
            }
            toast.success(`Deleted "${profile.name}".`);
            onDeleted();
          }}
        />
      ) : null}
      <DialogClose asChild>
        <Button disabled={pending}>Cancel</Button>
      </DialogClose>
      <Button type="submit" variant="primary" loading={saving}>
        {profile ? "Save changes" : "Create profile"}
      </Button>
    </DialogFooter>
  );
}
