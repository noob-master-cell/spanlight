import { useState } from "react";

import { DisabledReason } from "@/components/disabled-reason";
import { Button } from "@/components/ui/button";
import { useProjectParams } from "@/features/shell";

import { ALERTS_READ_ONLY_REASON } from "./alerts-layout";
import { RuleEditorDialog } from "./rule-editor-dialog";

interface CreateRuleButtonProps {
  canWrite: boolean;
  className?: string;
}

/** "Create rule": opens the rule editor, or explains why it is disabled for a member. */
export function CreateRuleButton({ canWrite, className }: CreateRuleButtonProps) {
  const { projectId } = useProjectParams();
  const [open, setOpen] = useState(false);

  if (!canWrite) {
    return (
      <DisabledReason reason={ALERTS_READ_ONLY_REASON}>
        <Button variant="primary" disabled className={className}>
          Create rule
        </Button>
      </DisabledReason>
    );
  }

  return (
    <>
      <Button
        variant="primary"
        className={className}
        onClick={() => {
          setOpen(true);
        }}
      >
        Create rule
      </Button>
      <RuleEditorDialog open={open} onOpenChange={setOpen} projectId={projectId} />
    </>
  );
}
