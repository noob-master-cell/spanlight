import { useState, type ReactElement } from "react";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { FaultProfile } from "@/lib/api";

import { ProfileForm } from "./profile-form";

interface ProfileDialogProps {
  /** The element that opens the dialog: "New fault profile" or a row's Edit. */
  trigger: ReactElement;
  /** The profile to edit; omitted for a new one. */
  profile?: FaultProfile;
}

/**
 * The create and edit dialog. The form mounts only while the dialog is open, so every opening
 * starts from the profile's stored values (or the defaults), never from a half-edited draft.
 */
export function ProfileDialog({ trigger, profile }: ProfileDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // While a save is running, no close path may drop the form.
        if (next || !pending) {
          setOpen(next);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {open ? (
        <DialogContent
          hideClose
          className="max-h-[calc(100dvh-2rem)] max-w-[720px] gap-0 overflow-y-auto rounded-card p-5 sm:p-7"
        >
          <ProfileForm
            profile={profile}
            onPendingChange={setPending}
            onDone={() => {
              setOpen(false);
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
