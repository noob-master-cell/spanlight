import { DialogHeading } from "@/components/dialog-heading";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";

import { requireDialogBody } from "./organization-flow";

interface RequireTwoFactorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgName: string;
  /** The save is in flight: the dialog can't be dismissed and "Require it" spins. */
  pending: boolean;
  onConfirm: () => void;
}

/**
 * "Require two-factor authentication?" (Figma "Organization — Require two-factor authentication
 * dialog"): turning the requirement on locks out members who haven't set it up, so it is asked
 * before it is saved. Turning it off saves without asking.
 */
export function RequireTwoFactorDialog({
  open,
  onOpenChange,
  orgName,
  pending,
  onConfirm,
}: RequireTwoFactorDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent hideClose className="max-w-[480px] gap-5 rounded-card p-5 sm:p-7">
        <DialogHeading
          title="Require two-factor authentication?"
          description={requireDialogBody(orgName)}
        />
        <DialogFooter className="gap-2.5">
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={onConfirm}>
            Require it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
