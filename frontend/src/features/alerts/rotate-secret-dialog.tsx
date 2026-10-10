import { useState } from "react";
import { toast } from "sonner";

import { Callout } from "@/components/callout";
import { DialogHeading } from "@/components/dialog-heading";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { errorMessage, isApiError, type AlertChannel } from "@/lib/api";

import { CHANNEL_COPY } from "./channel-kinds";
import { useRotateSecret } from "./channels-queries";
import { SecretReveal } from "./secret-reveal";

interface RotateSecretDialogProps {
  channel: AlertChannel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Figma "Rotate secret": confirm, then the one-time reveal of the new secret (the create reveal,
 * titled "Secret rotated"). The new secret lives in this component's state only and is dropped
 * when the dialog closes.
 */
export function RotateSecretDialog({ channel, open, onOpenChange }: RotateSecretDialogProps) {
  const rotate = useRotateSecret();
  const [secret, setSecret] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next && rotate.pending) {
      return;
    }
    onOpenChange(next);
    if (!next) {
      setSecret(null);
      setNotConfigured(false);
    }
  }

  async function confirm() {
    const result = await rotate.run(channel.id);
    if (result.ok && result.value.secret) {
      setSecret(result.value.secret);
    } else if (!result.ok && isApiError(result.error) && result.error.code === "NOT_CONFIGURED") {
      setNotConfigured(true);
    } else {
      toast.error(
        result.ok ? "The server sent no new secret. Try again." : errorMessage(result.error),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose
        className="max-h-[calc(100dvh-2rem)] max-w-[480px] gap-0 overflow-y-auto rounded-card p-6 sm:p-7"
        onInteractOutside={(event) => {
          // An outside click must not throw away a secret that is shown only once.
          if (secret !== null) {
            event.preventDefault();
          }
        }}
      >
        {secret === null ? (
          <div className="grid gap-[22px]">
            <DialogHeading
              title="Rotate the signing secret?"
              description={`${channel.name} gets a new secret right away. Requests signed with the old one will fail verification until you update your endpoint.`}
              showClose={rotate.pending ? "disabled" : true}
            />
            {notConfigured ? (
              <Callout tone="warning" role="alert" title={CHANNEL_COPY.notConfiguredTitle}>
                {CHANNEL_COPY.notConfiguredBody}
              </Callout>
            ) : null}
            <DialogFooter className="flex-row justify-end gap-2.5">
              <DialogClose asChild>
                <Button disabled={rotate.pending}>Cancel</Button>
              </DialogClose>
              <Button
                variant="primary"
                loading={rotate.pending}
                disabled={notConfigured}
                onClick={() => {
                  void confirm();
                }}
              >
                Rotate secret
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <SecretReveal
            channel={channel}
            secret={secret}
            rotated
            onDone={() => {
              handleOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
