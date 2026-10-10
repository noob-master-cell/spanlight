import { Callout } from "@/components/callout";
import { DialogHeading } from "@/components/dialog-heading";
import { SecretBox } from "@/components/secret-box";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import type { AlertChannel } from "@/lib/api";

interface SecretRevealProps {
  channel: AlertChannel;
  /** The signing secret, held by the caller in component state only. */
  secret: string;
  /** After a rotation rather than a create: the title reads "Secret rotated". */
  rotated: boolean;
  onDone: () => void;
}

/**
 * Figma "Channel dialog — webhook — signing secret": the webhook's signing secret, shown once,
 * with Copy and the "won't be able to see it again" warning. Used after a create and after a
 * rotation; the secret is gone once the dialog closes.
 */
export function SecretReveal({ channel, secret, rotated, onDone }: SecretRevealProps) {
  const url = "url" in channel.config ? channel.config.url : null;
  return (
    <div className="grid gap-[18px]">
      <DialogHeading
        title={rotated ? "Secret rotated" : "Channel created"}
        description={
          url ? (
            <>
              <span className="font-semibold text-foreground">{channel.name}</span> will receive
              signed requests at <span className="[overflow-wrap:anywhere]">{url}</span>.
            </>
          ) : undefined
        }
      />
      <Callout tone="warning">
        {"Copy this signing secret now. You won't be able to see it again."}
      </Callout>
      <div className="grid gap-2">
        <SecretBox
          label="Signing secret"
          secret={secret}
          copyAriaLabel={`Copy the signing secret of ${channel.name}`}
        />
        <p className="text-xs font-medium text-muted-foreground">
          {
            "Use it to verify the signature on each request. You can rotate it later from the channel's edit dialog."
          }
        </p>
      </div>
      <DialogFooter className="flex-row justify-end">
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}
