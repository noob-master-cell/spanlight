import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import type { useLeaveGuard } from "./use-leave-guard";

type LeaveGuard = ReturnType<typeof useLeaveGuard>;

/**
 * The confirm for a blocked navigation, in the shape of the app's confirm dialogs: one question,
 * Stay (the default, focused first) and a danger Leave.
 */
export function LeaveGuardDialog({ guard }: { guard: LeaveGuard }) {
  const { blocker } = guard;
  const blocked = blocker.status === "blocked";

  return (
    <AlertDialog
      open={blocked}
      onOpenChange={(open) => {
        if (!open && blocker.status === "blocked") {
          blocker.reset();
        }
      }}
    >
      <AlertDialogContent className="max-w-[440px] gap-5 rounded-card p-6 sm:p-7">
        <div className="flex flex-col gap-1.5">
          <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          <AlertDialogDescription>
            Your changes to this route aren&rsquo;t saved. If you leave now, they&rsquo;re lost.
          </AlertDialogDescription>
        </div>
        <AlertDialogFooter className="flex-row justify-end gap-2.5">
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <Button
            variant="danger"
            onClick={() => {
              if (blocker.status === "blocked") {
                blocker.proceed();
              }
            }}
          >
            Leave
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
