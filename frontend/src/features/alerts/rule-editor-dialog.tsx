import { useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { AlertRule } from "@/lib/api";
import { cn } from "@/lib/utils";

import { RuleForm } from "./rule-form";

interface RuleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** The rule to edit; omitted to create one. */
  rule?: AlertRule;
}

/**
 * The rule editor (Figma "Alerts — Rule editor"): a 720 px dialog on wider screens, a full-screen
 * sheet with a sticky footer on phones (frame 228:11266). The form is mounted only while open, so
 * each opening starts from the rule as stored. It can't be closed while a save is running.
 */
export function RuleEditorDialog({ open, onOpenChange, projectId, rule }: RuleEditorDialogProps) {
  const [pending, setPending] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape, Cancel, the close mark and an outside click all land here.
        if (next || !pending) {
          onOpenChange(next);
        }
      }}
    >
      {open ? (
        <DialogContent
          hideClose
          className={cn(
            "block max-h-[calc(100dvh-2rem)] max-w-[720px] overflow-y-auto rounded-card p-7",
            "max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:p-5",
          )}
        >
          <RuleForm
            projectId={projectId}
            rule={rule}
            onPendingChange={setPending}
            onSaved={() => {
              onOpenChange(false);
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
