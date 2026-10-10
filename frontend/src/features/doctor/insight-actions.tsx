import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { DisabledReason } from "@/components/disabled-reason";
import { ReadOnlyLine } from "@/components/read-only-line";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { InsightStatus } from "@/lib/api";

import { availableActions, READ_ONLY_REASON } from "./action-rules";
import { useAcknowledgeInsight, useResolveInsight, useUnmuteInsight } from "./doctor-queries";
import { actionErrorMessage } from "./insight-errors";
import { MuteDialog } from "./mute-dialog";

interface InsightActionsProps {
  insightId: string;
  status: InsightStatus;
  canManage: boolean;
}

/**
 * Figma "Doctor/Actions": Mute…, Resolve, Unmute and Acknowledge by status. Members and viewers
 * see them disabled, with the reason as visible text. A failed action says why, inline.
 */
export function InsightActions({ insightId, status, canManage }: InsightActionsProps) {
  const reasonId = useId();
  const [muting, setMuting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const acknowledge = useAcknowledgeInsight(insightId);
  const resolve = useResolveInsight(insightId);
  const unmute = useUnmuteInsight(insightId);
  const available = availableActions(status);
  const busy = acknowledge.isPending || resolve.isPending || unmute.isPending;

  function run(
    action: { mutate: (variables: undefined, options: MutateOptions) => void },
    done: string,
  ) {
    setFailure(null);
    action.mutate(undefined, {
      onSuccess: () => {
        toast.success(done);
        // The button that was clicked may be gone now; keep focus inside the actions.
        container.current?.focus();
      },
      onError: (error) => {
        setFailure(actionErrorMessage(error));
      },
    });
  }

  return (
    <div ref={container} tabIndex={-1} className="flex flex-col gap-2 outline-none lg:items-end">
      <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
        {available.mute ? (
          <ActionButton
            canManage={canManage}
            reasonId={reasonId}
            disabled={busy}
            onClick={() => {
              setFailure(null);
              setMuting(true);
            }}
          >
            Mute…
          </ActionButton>
        ) : null}
        {available.unmute ? (
          <ActionButton
            canManage={canManage}
            reasonId={reasonId}
            disabled={busy}
            loading={unmute.isPending}
            onClick={() => {
              run(unmute, "Unmuted the insight.");
            }}
          >
            Unmute
          </ActionButton>
        ) : null}
        {available.resolve ? (
          <ActionButton
            canManage={canManage}
            reasonId={reasonId}
            disabled={busy}
            loading={resolve.isPending}
            onClick={() => {
              run(resolve, "Resolved the insight.");
            }}
          >
            Resolve
          </ActionButton>
        ) : null}
        {available.acknowledge ? (
          <ActionButton
            canManage={canManage}
            reasonId={reasonId}
            variant="primary"
            disabled={busy}
            loading={acknowledge.isPending}
            onClick={() => {
              run(acknowledge, "Acknowledged the insight.");
            }}
          >
            Acknowledge
          </ActionButton>
        ) : null}
      </div>
      {canManage ? null : <ReadOnlyLine id={reasonId}>{READ_ONLY_REASON}</ReadOnlyLine>}
      {failure === null ? null : (
        <p role="alert" className="max-w-sm text-xs font-medium text-danger-text lg:text-right">
          {failure}
        </p>
      )}
      <MuteDialog insightId={insightId} open={muting} onOpenChange={setMuting} />
    </div>
  );
}

interface MutateOptions {
  onSuccess: () => void;
  onError: (error: unknown) => void;
}

interface ActionButtonProps extends ButtonProps {
  canManage: boolean;
  /** The visible read-only line; the disabled button is described by it. */
  reasonId: string;
}

/**
 * An action button. Without `insights:manage` it is disabled and wrapped so the reason is
 * reachable by keyboard (tooltip) and described by the visible read-only line, read once per
 * button rather than as a second hidden copy.
 */
function ActionButton({ canManage, reasonId, disabled, ...props }: ActionButtonProps) {
  if (canManage) {
    return <Button disabled={disabled} {...props} />;
  }
  return (
    <DisabledReason reason={READ_ONLY_REASON} describedBy={reasonId}>
      <Button disabled {...props} />
    </DisabledReason>
  );
}
