import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useProjectParams } from "@/features/shell";
import { errorMessage, type AlertRule } from "@/lib/api";

import { useDeleteRule } from "./alerts-queries";

interface DeleteRuleDialogProps {
  rule: AlertRule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Figma "Alerts — Delete rule dialog". Controlled, because it opens from the overflow menu. A
 * deleted rule takes its events with it; the page then goes back to the rules list.
 */
export function DeleteRuleDialog({ rule, open, onOpenChange }: DeleteRuleDialogProps) {
  const { orgId, projectId } = useProjectParams();
  const navigate = useNavigate();
  const deleteRule = useDeleteRule(() =>
    navigate({ to: "/$orgId/$projectId/alerts", params: { orgId, projectId } }),
  );
  const pending = deleteRule.isPending;

  async function confirm() {
    try {
      await deleteRule.mutateAsync(rule.id);
      toast.success(`Deleted alert rule "${rule.name}".`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          onOpenChange(next);
        }
      }}
    >
      <AlertDialogContent className="max-w-[440px] gap-5 rounded-card p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <AlertDialogTitle className="[overflow-wrap:anywhere]">
              Delete {rule.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The rule stops evaluating and its event history is deleted. This can&rsquo;t be
              undone.
            </AlertDialogDescription>
          </div>
          <AlertDialogPrimitive.Cancel asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              disabled={pending}
              className="bg-surface-muted"
            >
              <X aria-hidden />
            </Button>
          </AlertDialogPrimitive.Cancel>
        </div>
        <AlertDialogFooter className="flex-row justify-end gap-2.5">
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => {
              void confirm();
            }}
          >
            Delete rule
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
